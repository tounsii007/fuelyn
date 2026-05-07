package com.tankpilot.ai.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.tankpilot.ai.backend.EnrichmentBackend;
import com.tankpilot.ai.fallback.LocalHeuristicFallback;
import com.tankpilot.ai.model.AIAdvisorRequest;
import com.tankpilot.ai.model.AIAdvisorResponse;
import com.tankpilot.ai.telemetry.RegretLogger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.UUID;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Orchestrator for the tiered advisor pipeline.
 *
 * <h3>Pipeline</h3>
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
 * <ul>
 *   <li>Cache absorbs the bulk of repeated identical lookups.</li>
 *   <li>The heuristic guarantees a useful response even if both LLMs
 *       are down — algorithmic correctness never depends on network.</li>
 *   <li>The LLM tier is opt-in via Spring properties; with nothing
 *       configured the service degrades gracefully to heuristic-only.</li>
 *   <li>Local Ollama runs first so the cheapest option is preferred,
 *       and OpenAI tokens are only spent on Ollama outages.</li>
 * </ul>
 *
 * <h3>Provider order</h3>
 * Driven by {@code tankpilot.ai.providers}, default {@code "ollama,openai"}.
 * Each backend is queried in order; the first one whose
 * {@link EnrichmentBackend#isAvailable()} returns true and whose
 * {@link EnrichmentBackend#enrich} doesn't throw, wins. Failures are
 * logged and fall through to the next provider, then ultimately to the
 * pure heuristic baseline.
 */
@Service
public class AdvisorService {

    private static final Logger log = LoggerFactory.getLogger(AdvisorService.class);

    private final Cache<String, AIAdvisorResponse> responseCache;
    private final List<EnrichmentBackend> orderedBackends;
    private final boolean enrichmentEnabled;
    private final RegretLogger regretLogger;

    /**
     * Test-friendly overload — RegretLogger is optional so unit tests
     * can construct the service without wiring up SLF4J marker plumbing.
     */
    public AdvisorService(
            List<EnrichmentBackend> backends,
            boolean enrichmentEnabled,
            String providersCsv,
            long cacheMaxSize,
            long cacheTtlMinutes
    ) {
        this(backends, enrichmentEnabled, providersCsv, cacheMaxSize, cacheTtlMinutes, null);
    }

    @Autowired(required = false)
    public AdvisorService(
            List<EnrichmentBackend> backends,
            @Value("${tankpilot.ai.enrichment.enabled:true}") boolean enrichmentEnabled,
            @Value("${tankpilot.ai.providers:ollama,openai}") String providersCsv,
            @Value("${tankpilot.ai.cache.max-size:200}") long cacheMaxSize,
            @Value("${tankpilot.ai.cache.ttl-minutes:15}") long cacheTtlMinutes,
            RegretLogger regretLogger
    ) {
        this.regretLogger = regretLogger;
        this.enrichmentEnabled = enrichmentEnabled;
        this.responseCache = Caffeine.newBuilder()
                .maximumSize(cacheMaxSize)
                .expireAfterWrite(cacheTtlMinutes, TimeUnit.MINUTES)
                .build();
        this.orderedBackends = orderBackends(backends, providersCsv);

        log.info("AdvisorService ready — enrichment={}, providers={}, cache={}min×{}",
                enrichmentEnabled,
                orderedBackends.stream().map(EnrichmentBackend::name).toList(),
                cacheTtlMinutes, cacheMaxSize);
    }

    /**
     * Resolve the advisor pipeline for the given request.
     *
     * <p>Never throws — pipeline failures degrade silently to the
     * heuristic baseline, which is guaranteed to produce a usable
     * response even with empty inputs.</p>
     */
    public AIAdvisorResponse getRecommendation(AIAdvisorRequest request) {
        // [1] Cache
        String cacheKey = buildCacheKey(request);
        AIAdvisorResponse cached = responseCache.getIfPresent(cacheKey);
        if (cached != null) {
            log.debug("Cache HIT — key={}", cacheKey);
            return cached.withFromCache(true);
        }

        // [2] Heuristic baseline (always)
        AIAdvisorResponse baseline = LocalHeuristicFallback.analyze(request);

        // [3] Optional LLM enrichment
        AIAdvisorResponse result = baseline;
        if (enrichmentEnabled && !orderedBackends.isEmpty()) {
            result = tryEnrichmentChain(request, baseline);
        }

        // [4] Cache final result
        responseCache.put(cacheKey, result);

        // [5] Telemetry — non-blocking, never alters the response
        if (regretLogger != null) {
            try {
                regretLogger.record(UUID.randomUUID().toString().substring(0, 8), request, result);
            } catch (Exception ignored) { /* never break the request path */ }
        }

        return result;
    }

    /**
     * Walk the configured backends in order; return the first
     * successful enrichment. On total failure return the baseline.
     */
    private AIAdvisorResponse tryEnrichmentChain(AIAdvisorRequest request, AIAdvisorResponse baseline) {
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
     * Apply the configured provider order to the auto-discovered
     * backends. Backends not listed in {@code providersCsv} are
     * silently dropped, so an operator can disable a single tier
     * without editing code.
     */
    private static List<EnrichmentBackend> orderBackends(List<EnrichmentBackend> backends, String providersCsv) {
        if (backends == null || backends.isEmpty()) return List.of();

        List<String> wanted = Arrays.stream(providersCsv.split(","))
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
                .sorted(Comparator.comparingInt(b -> {
                    String key = b.name().split(":", 2)[0];
                    int idx = wanted.indexOf(key);
                    return idx < 0 ? Integer.MAX_VALUE : idx;
                }))
                .toList();
    }

    private static String buildCacheKey(AIAdvisorRequest request) {
        double lat = request.lat() == null ? 0 : request.lat();
        double lng = request.lng() == null ? 0 : request.lng();
        double rLat = Math.round(lat * 100.0) / 100.0;
        double rLng = Math.round(lng * 100.0) / 100.0;
        int sig = request.prices() == null ? 0 : request.prices().size();
        return request.fuelType() + ":" + rLat + ":" + rLng + ":" + sig;
    }
}
