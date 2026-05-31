package com.fuelyn.ai.service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fuelyn.ai.backend.EnrichmentBackend;
import com.fuelyn.ai.fallback.LocalHeuristicFallback;
import com.fuelyn.ai.model.AIAdvisorRequest;
import com.fuelyn.ai.model.AIAdvisorResponse;
import com.fuelyn.ai.stream.PriceHistoryBuffer;
import com.fuelyn.ai.telemetry.RegretLogger;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

/**
 * Orchestrator for the tiered advisor pipeline.
 *
 * <h3>Pipeline</h3>
 *
 * <pre>
 *   Request
 *     ↓
 *   [1] Caffeine cache (15 min, key = fuelType + lat/lng @ 0.01°)
 *     ↓ MISS
 *   [2] Heuristic baseline — deterministic verdict, always succeeds
 *     ↓
 *   [3] Optional LLM enrichment (only the prose fields):
 *         a) try Ollama (local, free)        — if available
 *         b) try OpenAI (premium, $)         — if Ollama unavailable / failed
 *     ↓
 *   [4] Cache + return
 * </pre>
 *
 * <h3>Why tiered</h3>
 *
 * <ul>
 *   <li>Cache absorbs the bulk of repeated identical lookups.
 *   <li>The heuristic guarantees a useful response even if both LLMs are down — algorithmic
 *       correctness never depends on network.
 *   <li>The LLM tier is opt-in via Spring properties; with nothing configured the service degrades
 *       gracefully to heuristic-only.
 *   <li>Local Ollama runs first so the cheapest option is preferred, and OpenAI tokens are only
 *       spent on Ollama outages.
 * </ul>
 *
 * <h3>Provider order</h3>
 *
 * Driven by {@code fuelyn.ai.providers}, default {@code "ollama,openai"}. Each backend is queried
 * in order; the first one whose {@link EnrichmentBackend#isAvailable()} returns true and whose
 * {@link EnrichmentBackend#enrich} doesn't throw, wins. Failures are logged and fall through to the
 * next provider, then ultimately to the pure heuristic baseline.
 */
@Service
public class AdvisorService {

    private static final Logger log = LoggerFactory.getLogger(AdvisorService.class);

    private final Cache<String, AIAdvisorResponse> responseCache;
    private final List<EnrichmentBackend> orderedBackends;
    private final boolean enrichmentEnabled;
    private final RegretLogger regretLogger;

    /** Per-station rolling history fed by the Kafka consumer; nullable for tests. */
    private final PriceHistoryBuffer historyBuffer;

    /**
     * Test-friendly overload — RegretLogger and PriceHistoryBuffer are optional so unit tests can
     * construct the service without wiring up Kafka or SLF4J marker plumbing.
     */
    public AdvisorService(
            List<EnrichmentBackend> backends,
            boolean enrichmentEnabled,
            String providersCsv,
            long cacheMaxSize,
            long cacheTtlMinutes) {
        this(backends, enrichmentEnabled, providersCsv, cacheMaxSize, cacheTtlMinutes, null, null);
    }

    public AdvisorService(
            List<EnrichmentBackend> backends,
            boolean enrichmentEnabled,
            String providersCsv,
            long cacheMaxSize,
            long cacheTtlMinutes,
            RegretLogger regretLogger) {
        this(
                backends,
                enrichmentEnabled,
                providersCsv,
                cacheMaxSize,
                cacheTtlMinutes,
                regretLogger,
                null);
    }

    @Autowired(required = false)
    public AdvisorService(
            List<EnrichmentBackend> backends,
            @Value("${fuelyn.ai.enrichment.enabled:true}") boolean enrichmentEnabled,
            @Value("${fuelyn.ai.providers:ollama,openai}") String providersCsv,
            @Value("${fuelyn.ai.cache.max-size:200}") long cacheMaxSize,
            @Value("${fuelyn.ai.cache.ttl-minutes:15}") long cacheTtlMinutes,
            RegretLogger regretLogger,
            PriceHistoryBuffer historyBuffer) {
        this.regretLogger = regretLogger;
        this.historyBuffer = historyBuffer;
        this.enrichmentEnabled = enrichmentEnabled;
        this.responseCache =
                Caffeine.newBuilder()
                        .maximumSize(cacheMaxSize)
                        .expireAfterWrite(cacheTtlMinutes, TimeUnit.MINUTES)
                        .build();
        this.orderedBackends = orderBackends(backends, providersCsv);

        log.info(
                "AdvisorService ready — enrichment={}, providers={}, cache={}min×{}, buffer={}",
                enrichmentEnabled,
                orderedBackends.stream().map(EnrichmentBackend::name).toList(),
                cacheTtlMinutes,
                cacheMaxSize,
                historyBuffer != null ? "ON" : "OFF");
    }

    /**
     * Resolve the advisor pipeline for the given request.
     *
     * <p>Never throws — pipeline failures degrade silently to the heuristic baseline, which is
     * guaranteed to produce a usable response even with empty inputs.
     */
    /**
     * Drop every cached response. Called by the Kafka listener when any station's price moved —
     * guarantees the next request runs the heuristic against fresh data instead of serving a stale
     * verdict. Cheap at our scale (cache holds ≤ 200 entries).
     */
    public void invalidateCache() {
        responseCache.invalidateAll();
    }

    public AIAdvisorResponse getRecommendation(AIAdvisorRequest request) {
        // [1] Cache
        String cacheKey = buildCacheKey(request);
        AIAdvisorResponse cached = responseCache.getIfPresent(cacheKey);
        if (cached != null) {
            log.debug("Cache HIT — key={}", cacheKey);
            return cached.withFromCache(true);
        }

        // [2] Deep-analysis enrichment — pull stored Kafka history into
        // the request before any signal runs, so EWMA / change-point /
        // forecaster / Bayes prior all see real per-station observations
        // instead of whatever the BFF happened to forward (often empty).
        AIAdvisorRequest enrichedRequest = enrichWithHistory(request);

        // [3] Heuristic baseline (always)
        AIAdvisorResponse baseline = LocalHeuristicFallback.analyze(enrichedRequest);

        // [4] Optional LLM enrichment
        AIAdvisorResponse result = baseline;
        if (enrichmentEnabled && !orderedBackends.isEmpty()) {
            result = tryEnrichmentChain(enrichedRequest, baseline);
        }

        // [5] Cache final result
        responseCache.put(cacheKey, result);

        // [6] Telemetry — non-blocking, never alters the response
        if (regretLogger != null) {
            try {
                regretLogger.record(
                        UUID.randomUUID().toString().substring(0, 8), enrichedRequest, result);
            } catch (Exception ignored) {
                /* never break the request path */
            }
        }

        return result;
    }

    /**
     * Augment {@code request.priceHistory()} with stored Kafka observations for the cheapest
     * station in the request. Cheapest is what every signal — Ewma trend, change-point, forecaster
     * — keys on, so giving it real history is the highest-impact lever per request.
     *
     * <p>Behaviour matrix:
     *
     * <ul>
     *   <li>Buffer disabled / empty → return request unchanged
     *   <li>Caller already supplied ≥ 4 history points → return request unchanged (caller knows
     *       their own data better than the broker)
     *   <li>Otherwise → return a new record with priceHistory built from the buffer's
     *       cheapest-station tuple
     * </ul>
     *
     * Records are immutable; we copy via the canonical 8-arg constructor so future fields don't
     * silently get dropped.
     */
    private AIAdvisorRequest enrichWithHistory(AIAdvisorRequest request) {
        if (historyBuffer == null) return request;
        if (request.prices() == null || request.prices().isEmpty()) return request;

        // We previously short-circuited on `priceHistory().size() >= 4`
        // — but the caller's history might be a 4-point window of OLD
        // (overnight) snapshots, while the buffer holds fresher Kafka
        // events. Compare the latest timestamps and only skip when the
        // request already has the freshest data we can offer.
        AIAdvisorRequest.StationPrice cheapest =
                request.prices().stream()
                        .min(Comparator.comparingDouble(AIAdvisorRequest.StationPrice::price))
                        .orElse(null);
        if (cheapest == null) return request;

        // The Kafka payload uses the canonical Tankerkönig station UUID.
        // The advisor request's StationPrice has only stationName, so we
        // need a compatible identifier — fall back to stationName which
        // is what the price-service publishes as the brand+street tuple.
        String key = cheapest.stationName();
        Optional<PriceHistoryBuffer.Aggregate> agg =
                historyBuffer.aggregate(key, request.fuelType());
        if (agg.isEmpty()) {
            log.debug("Deep-analysis: no buffered history for {} ({})", key, request.fuelType());
            return request;
        }

        // Caller already shipped a richer-and-fresher window? Trust it.
        // We define "fresher" as: caller's last point's timestamp string
        // sorts ≥ buffer's last observation. The advisor PricePoint
        // schema serialises Instant as ISO-8601, which is lexicographic-
        // sortable, so this is correct without parsing.
        if (request.priceHistory() != null && request.priceHistory().size() >= 8) {
            String callerLast =
                    request.priceHistory().get(request.priceHistory().size() - 1).timestamp();
            String bufferLast = agg.get().last().toString();
            if (callerLast != null && callerLast.compareTo(bufferLast) >= 0) {
                log.debug(
                        "Deep-analysis: caller already supplied {} points up to {} "
                                + "(buffer last={}) — leaving untouched",
                        request.priceHistory().size(),
                        callerLast,
                        bufferLast);
                return request;
            }
        }

        List<AIAdvisorRequest.PricePoint> derived =
                historyBuffer.recent(key, request.fuelType()).stream()
                        .map(
                                p ->
                                        new AIAdvisorRequest.PricePoint(
                                                p.price(), p.observedAt().toString()))
                        .toList();

        if (derived.size() < 4) {
            log.debug(
                    "Deep-analysis: only {} history points for {}, leaving untouched",
                    derived.size(),
                    key);
            return request;
        }

        log.info(
                "Deep-analysis: injecting {} buffered points for {} ({}) — "
                        + "min={}, max={}, μ={}, σ={}, z={}",
                derived.size(),
                key,
                request.fuelType(),
                String.format("%.3f", agg.get().minPrice()),
                String.format("%.3f", agg.get().maxPrice()),
                String.format("%.3f", agg.get().meanPrice()),
                String.format("%.4f", agg.get().stdDev()),
                String.format("%.2f", agg.get().currentZ()));

        return new AIAdvisorRequest(
                request.prices(),
                request.fuelType(),
                derived,
                request.lat(),
                request.lng(),
                request.fillUpLiters(),
                request.vehicleProfile(),
                request.destination());
    }

    /**
     * Walk the configured backends in order; return the first successful enrichment. On total
     * failure return the baseline.
     */
    private AIAdvisorResponse tryEnrichmentChain(
            AIAdvisorRequest request, AIAdvisorResponse baseline) {
        for (EnrichmentBackend backend : orderedBackends) {
            if (!backend.isAvailable()) {
                log.debug("Skip {} — not available", backend.name());
                continue;
            }
            try {
                AIAdvisorResponse enriched = backend.enrich(request, baseline);
                log.info("Enriched via {}", backend.name());
                return enriched;
            } catch (Exception e) {
                log.warn("Backend {} failed: {} — falling through", backend.name(), e.getMessage());
                // continue to next backend
            }
        }
        log.debug("All enrichment backends exhausted — using heuristic baseline");
        return baseline;
    }

    /**
     * Apply the configured provider order to the auto-discovered backends. Backends not listed in
     * {@code providersCsv} are silently dropped, so an operator can disable a single tier without
     * editing code.
     */
    private static List<EnrichmentBackend> orderBackends(
            List<EnrichmentBackend> backends, String providersCsv) {
        if (backends == null || backends.isEmpty()) return List.of();

        List<String> wanted =
                Arrays.stream(providersCsv.split(","))
                        .map(String::trim)
                        .filter(s -> !s.isEmpty())
                        .toList();

        // Map each backend to its canonical provider key (everything
        // before the first ':' in name() — e.g. "ollama:qwen2.5:3b").
        Map<String, EnrichmentBackend> byKey = new LinkedHashMap<>();
        for (EnrichmentBackend b : backends) {
            String key = b.name().split(":", 2)[0];
            byKey.putIfAbsent(key, b);
        }

        List<EnrichmentBackend> ordered = new ArrayList<>();
        for (String key : wanted) {
            EnrichmentBackend b = byKey.get(key);
            if (b != null) ordered.add(b);
        }
        // Append any backends not explicitly listed so a dev who
        // forgot to update the CSV still sees them in logs.
        for (EnrichmentBackend b : backends) {
            String key = b.name().split(":", 2)[0];
            if (ordered.stream().noneMatch(o -> o.name().equals(b.name()))
                    && wanted.stream().noneMatch(w -> w.equals(key))) {
                ordered.add(b);
            }
        }
        return ordered.stream()
                .sorted(
                        Comparator.comparingInt(
                                b -> {
                                    String key = b.name().split(":", 2)[0];
                                    int idx = wanted.indexOf(key);
                                    return idx < 0 ? Integer.MAX_VALUE : idx;
                                }))
                .toList();
    }

    /**
     * Build a collision-resistant cache key.
     *
     * <p>Old key was {@code fuelType:rLat:rLng:count}, so two requests with the same bucket and
     * same station count but completely different stations / prices collided — a user querying
     * station set A might receive the verdict computed for set B if both happened to bucket to the
     * same 0.01° grid square. Even within a single user's session, two refreshes seconds apart
     * (with the same N stations but a price just changed at one of them) used to short-circuit to
     * the stale verdict.
     *
     * <p>The new key folds in a deterministic SHA-256 of the sorted station list (name +
     * price-rounded + distance-rounded), so a change in any station triggers a fresh verdict.
     * Sorted ordering keeps the digest stable when the upstream returns the same set in a different
     * order.
     */
    /** Package-private for unit tests; product callers go through {@code getRecommendation}. */
    static String buildCacheKey(AIAdvisorRequest request) {
        double lat = request.lat() == null ? 0 : request.lat();
        double lng = request.lng() == null ? 0 : request.lng();
        double rLat = Math.round(lat * 100.0) / 100.0;
        double rLng = Math.round(lng * 100.0) / 100.0;
        String pricesDigest = digestStations(request.prices());
        return request.fuelType()
                + ":"
                + rLat
                + ":"
                + rLng
                + ":"
                + pricesDigest
                + ":"
                + personalizationKey(request);
    }

    /**
     * Personalization suffix for the cache key. {@code fillUpLiters}, the vehicle profile, and the
     * destination all change the recommendation, so two otherwise-identical requests with different
     * personalization MUST NOT share a cached verdict — that would serve one user's advice to
     * another within the same geo bucket. Null optionals collapse to a stable token.
     */
    private static String personalizationKey(AIAdvisorRequest request) {
        StringBuilder sb = new StringBuilder(48);
        sb.append('f').append(request.fillUpLiters() == null ? 50 : request.fillUpLiters());
        AIAdvisorRequest.VehicleProfile vp = request.vehicleProfile();
        if (vp != null) {
            sb.append("|v")
                    .append(vp.consumptionL100km())
                    .append(',')
                    .append(vp.fuelLevel())
                    .append(',')
                    .append(vp.tankCapacityL());
        }
        AIAdvisorRequest.Destination d = request.destination();
        if (d != null) {
            sb.append("|d")
                    .append(d.lat() == null ? "" : Math.round(d.lat() * 100.0) / 100.0)
                    .append(',')
                    .append(d.lng() == null ? "" : Math.round(d.lng() * 100.0) / 100.0);
        }
        return sb.toString();
    }

    private static String digestStations(java.util.List<AIAdvisorRequest.StationPrice> prices) {
        if (prices == null || prices.isEmpty()) {
            return "0";
        }
        StringBuilder canonical = new StringBuilder(prices.size() * 32);
        prices.stream()
                .sorted(
                        java.util.Comparator.comparing(
                                        AIAdvisorRequest.StationPrice::stationName,
                                        java.util.Comparator.nullsLast(String::compareTo))
                                .thenComparingDouble(AIAdvisorRequest.StationPrice::price))
                .forEach(
                        p ->
                                canonical
                                        .append(p.stationName())
                                        .append('|')
                                        .append(Math.round(p.price() * 1000.0))
                                        .append('|')
                                        .append(Math.round(p.distance() * 100.0))
                                        .append(';'));
        try {
            byte[] hash =
                    java.security.MessageDigest.getInstance("SHA-256")
                            .digest(
                                    canonical
                                            .toString()
                                            .getBytes(java.nio.charset.StandardCharsets.UTF_8));
            // 12 hex chars = 48 bits = ~280 trillion buckets — comfortable
            // for our cache size of a few hundred entries.
            StringBuilder hex = new StringBuilder(12);
            for (int i = 0; i < 6; i++) {
                hex.append(String.format("%02x", hash[i]));
            }
            return prices.size() + "_" + hex;
        } catch (java.security.NoSuchAlgorithmException unreachable) {
            // SHA-256 is mandated by the JCA spec — every JDK ships it.
            return prices.size() + "_fallback";
        }
    }
}
