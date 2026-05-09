package com.fuelyn.price.service;

import com.fuelyn.common.events.PriceUpdatedEvent;
import com.fuelyn.price.model.dto.CollectionResult;
import com.fuelyn.price.model.dto.TankerkoenigResponse;
import com.fuelyn.price.model.entity.CollectionRun;
import com.fuelyn.price.model.entity.PriceSnapshot;
import com.fuelyn.price.model.entity.StationMeta;
import com.fuelyn.price.repository.CollectionRunRepository;
import com.fuelyn.price.repository.PriceSnapshotRepository;
import com.fuelyn.price.repository.StationMetaRepository;
import com.fuelyn.price.stream.PriceEventPublisher;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Orchestrates periodic price collection from Tankerkoenig API.
 *
 * <p>Collects fuel prices for 10 major German cities, storing snapshots
 * in the database for historical analysis and AI-powered recommendations.</p>
 */
@Service
public class PriceCollectorService {

    private static final Logger log = LoggerFactory.getLogger(PriceCollectorService.class);

    /** Major German cities for price collection. */
    /**
     * Germany-wide collection grid.
     *
     * <p>Built from two layers so the API budget stays small while
     * coverage approaches whole-country: 50 of the largest cities
     * (each pulled at the configured radius — covers the bulk of
     * the population) plus a sparse 30-point hexagonal-ish grid that
     * fills the rural connectors so a user in the Eifel or
     * Mecklenburg-Vorpommern still gets sparklines.</p>
     *
     * <p>Total ≈ 80 calls per scheduled cycle. At a 5-minute cadence
     * that's 0.27 calls/second — safely under any sane Tankerkönig
     * professional-tier rate-limit. Stations within overlapping
     * radii are deduplicated server-side by stationId.</p>
     *
     * <p>Long-term this should be replaced by user-density-driven
     * dynamic discovery (track which lat/lng buckets users actually
     * browse and feed those into the next cycle) — that scales
     * without a hand-curated list.</p>
     */
    /**
     * Polling grid loaded from {@code cities.csv} on the classpath.
     *
     * <p>Why a CSV instead of a static {@code List.of(...)} literal?
     * Java imposes a 64 KB hard cap on the bytecode of any single
     * method, including the synthetic class initialiser {@code <clinit>}.
     * With ~4 500 entries the {@code List.of} expression overflowed
     * that limit and the compiler refused with "code too large".
     * Reading from the classpath sidesteps the JVM ceiling, makes the
     * list trivially editable without recompilation, and shrinks the
     * compiled class size by ~150 KB.</p>
     */
    private static final List<CityCoord> CITIES = loadCitiesFromClasspath();

    private final TankerkoenigClient tankerkoenigClient;
    private final PriceSnapshotRepository snapshotRepo;
    private final StationMetaRepository stationRepo;
    private final CollectionRunRepository runRepo;
    private final PriceEventPublisher priceEventPublisher;
    private final double radiusKm;
    private final int maxHistoryDays;
    /**
     * Worker count for parallel polling. The Resilience4j {@code @RateLimiter}
     * on {@link TankerkoenigClient#searchStations} is the actual throttle —
     * threads beyond the permit budget block waiting for tokens. Parallelism
     * therefore does NOT amplify upstream load; it only smooths wall time
     * around slow HTTP responses (one stuck request no longer pauses the
     * whole queue). Default 4 covers I/O latency without thread thrash.
     */
    private final int parallelism;

    /**
     * Phase B1 — empty-city skip filter.
     *
     * <p>Of the ~4 600 polling points, a non-trivial number return zero
     * stations cycle after cycle: tiny Mecklenburg villages with no
     * fuel station, North-Sea islands with one closed bunker, etc.
     * Polling them is a sunk cost — every empty call eats a Resilience4j
     * permit and burns ~150 ms of wall time without producing data.</p>
     *
     * <p>This map records per-city consecutive-empty counts. When the
     * count crosses {@link #SKIP_THRESHOLD} we tag the city as "cold"
     * and skip it for the next {@link #COLD_CYCLES} cycles. Every
     * {@link #DISCOVERY_INTERVAL_CYCLES} cycles we force a re-poll of
     * every cold city in case a station opened (rare but possible).</p>
     *
     * <p>The map is in-memory per JVM. A restart re-discovers cold
     * cities organically — by design, no DB round trip needed.</p>
     */
    private final Map<String, AtomicInteger> consecutiveEmpty = new ConcurrentHashMap<>();
    private final Map<String, AtomicInteger> coldSkipsRemaining = new ConcurrentHashMap<>();
    private final AtomicLong cycleCount = new AtomicLong();
    private static final int SKIP_THRESHOLD = 5;
    private static final int COLD_CYCLES = 48;
    private static final int DISCOVERY_INTERVAL_CYCLES = 48;

    /**
     * Phase A1 — observability. Optional so tests + early bootstrap don't
     * need a registry; in production the Micrometer auto-config wires it
     * automatically. Counters/timers created on first use are cached on
     * the registry, so we don't pay name-resolution cost per cycle.
     */
    private final MeterRegistry meterRegistry;
    /** Counter for entire-cycle outcomes — `result=success|degraded`. */
    private Counter cycleCounter;
    private Counter cycleDegradedCounter;
    /** Per-city outcome — `outcome=ok|empty|failed`. Tag pruned to keep
     *  cardinality bounded (city name is ~5 000 unique values, never tag). */
    private Counter cityOkCounter;
    private Counter cityEmptyCounter;
    private Counter cityFailedCounter;
    /** Wall-clock time for one entire cycle. */
    private Timer cycleTimer;

    public PriceCollectorService(
            TankerkoenigClient tankerkoenigClient,
            PriceSnapshotRepository snapshotRepo,
            StationMetaRepository stationRepo,
            CollectionRunRepository runRepo,
            PriceEventPublisher priceEventPublisher,
            // 25km is Tankerkönig's per-call maximum, and our 80-point
            // grid is spaced so neighbouring radii overlap — guarantees
            // every German station is reached at least once per cycle.
            @Value("${fuelyn.collection.radius-km:25}") double radiusKm,
            @Value("${fuelyn.collection.max-history-days:90}") int maxHistoryDays,
            @Value("${fuelyn.collection.parallelism:4}") int parallelism,
            @Autowired(required = false) MeterRegistry meterRegistry
    ) {
        this.tankerkoenigClient = tankerkoenigClient;
        this.snapshotRepo = snapshotRepo;
        this.stationRepo = stationRepo;
        this.runRepo = runRepo;
        this.priceEventPublisher = priceEventPublisher;
        this.radiusKm = radiusKm;
        this.maxHistoryDays = maxHistoryDays;
        this.parallelism = Math.max(1, Math.min(parallelism, 16));
        this.meterRegistry = meterRegistry;

        if (meterRegistry != null) {
            this.cycleCounter = meterRegistry.counter("fuelyn.collection.cycles", Tags.of("result", "success"));
            this.cycleDegradedCounter = meterRegistry.counter("fuelyn.collection.cycles", Tags.of("result", "degraded"));
            this.cityOkCounter = meterRegistry.counter("fuelyn.collection.cities", Tags.of("outcome", "ok"));
            this.cityEmptyCounter = meterRegistry.counter("fuelyn.collection.cities", Tags.of("outcome", "empty"));
            this.cityFailedCounter = meterRegistry.counter("fuelyn.collection.cities", Tags.of("outcome", "failed"));
            this.cycleTimer = Timer.builder("fuelyn.collection.cycle.duration")
                    .description("Wall-clock duration of one full collection cycle")
                    .publishPercentiles(0.5, 0.95, 0.99)
                    .register(meterRegistry);
            // Gauge for the static city-list size — useful for dashboards
            // that visualise the polling target growing over time.
            meterRegistry.gauge("fuelyn.collection.cities.configured", CITIES.size());
        }
    }

    /**
     * Collects prices from all configured cities.
     * Each city is processed independently; partial failures do not block others.
     */
    public CollectionResult collectAll() {
        long start = System.currentTimeMillis();

        CollectionRun run = new CollectionRun();
        run.setStartedAt(LocalDateTime.now());
        run.setStatus("running");
        runRepo.save(run);

        // Counters are atomic so worker threads can update them lock-free.
        AtomicInteger totalStations = new AtomicInteger();
        AtomicInteger totalPrices = new AtomicInteger();
        AtomicInteger failedCities = new AtomicInteger();
        AtomicInteger emptyCities = new AtomicInteger();
        AtomicInteger skippedCold = new AtomicInteger();

        // Phase B1 — every Nth cycle is a discovery sweep that polls
        // even cold cities, so an opened-but-previously-empty hamlet
        // gets picked up. Between sweeps, cold cities are skipped.
        long cycle = cycleCount.incrementAndGet();
        boolean discoverySweep = (cycle % DISCOVERY_INTERVAL_CYCLES) == 0;
        if (discoverySweep) {
            coldSkipsRemaining.clear();
            log.info("Cycle #{}: discovery sweep — re-polling every city, including cold ones", cycle);
        }

        log.info("Starting collection of {} cities (parallelism={}, radius={}km, discovery={})",
                CITIES.size(), parallelism, radiusKm, discoverySweep);

        // Daemon executor — never block JVM shutdown if a poll is mid-flight.
        ExecutorService pool = Executors.newFixedThreadPool(parallelism, daemonThreadFactory("fuelyn-collect"));
        try {
            List<CompletableFuture<Void>> futures = CITIES.stream()
                    .map(city -> CompletableFuture.runAsync(() -> {
                        // Phase B1 — skip cities that have been empty for
                        // SKIP_THRESHOLD consecutive cycles, until either
                        // (a) their cooldown expires, or (b) the next
                        // discovery sweep forces a re-check.
                        if (!discoverySweep) {
                            AtomicInteger remaining = coldSkipsRemaining.get(city.name());
                            if (remaining != null && remaining.decrementAndGet() > 0) {
                                skippedCold.incrementAndGet();
                                return;
                            } else if (remaining != null) {
                                // Cooldown expired — give the city one chance
                                // to prove it's still cold; remove the entry
                                // so the standard threshold logic re-applies.
                                coldSkipsRemaining.remove(city.name());
                            }
                        }
                        try {
                            CollectionResult r = collectForArea(city.lat(), city.lng(), city.name());
                            totalStations.addAndGet(r.stationsCount());
                            totalPrices.addAndGet(r.pricesCount());
                            if (r.stationsCount() == 0) {
                                emptyCities.incrementAndGet();
                                if (cityEmptyCounter != null) cityEmptyCounter.increment();
                                int empties = consecutiveEmpty
                                        .computeIfAbsent(city.name(), k -> new AtomicInteger())
                                        .incrementAndGet();
                                if (empties >= SKIP_THRESHOLD) {
                                    coldSkipsRemaining.put(city.name(), new AtomicInteger(COLD_CYCLES));
                                    consecutiveEmpty.remove(city.name()); // reset for next discovery
                                    log.debug("Phase B1: marking {} cold for {} cycles",
                                            city.name(), COLD_CYCLES);
                                }
                            } else {
                                consecutiveEmpty.remove(city.name());
                                if (cityOkCounter != null) cityOkCounter.increment();
                            }
                        } catch (Exception e) {
                            failedCities.incrementAndGet();
                            if (cityFailedCounter != null) cityFailedCounter.increment();
                            // WARN, not ERROR — a single failed city is expected
                            // (transient API hiccup, rate-limit timeout). Only the
                            // summary at the end of the cycle warrants the higher
                            // log level if we crossed a sane failure threshold.
                            log.warn("Collection failed for {}: {}", city.name(), e.getMessage());
                        }
                    }, pool))
                    .toList();

            CompletableFuture
                    .allOf(futures.toArray(CompletableFuture[]::new))
                    .join();
        } finally {
            pool.shutdown();
            try {
                if (!pool.awaitTermination(60, TimeUnit.SECONDS)) {
                    pool.shutdownNow();
                }
            } catch (InterruptedException ie) {
                pool.shutdownNow();
                Thread.currentThread().interrupt();
            }
        }

        long duration = System.currentTimeMillis() - start;
        int failedCount = failedCities.get();
        int total = CITIES.size();

        run.setCompletedAt(LocalDateTime.now());
        run.setStationsCount(totalStations.get());
        run.setPricesCount(totalPrices.get());
        run.setStatus(failedCount > total / 4 ? "completed-with-errors" : "completed");
        runRepo.save(run);

        // Phase A1 — record cycle outcome to Micrometer. The Timer expects
        // a duration; passing the wall-clock millis as a measurement keeps
        // both percentile windows and the count meter in lock-step.
        if (cycleTimer != null) cycleTimer.record(duration, TimeUnit.MILLISECONDS);
        if (failedCount > total / 4) {
            if (cycleDegradedCounter != null) cycleDegradedCounter.increment();
        } else {
            if (cycleCounter != null) cycleCounter.increment();
        }

        // Cross >25% failure threshold: surface as ERROR so the SRE
        // alarm picks it up; otherwise INFO is plenty.
        if (failedCount > total / 4) {
            log.error("Collection finished DEGRADED: {}/{} cities failed, {} empty, {} cold-skipped, {} stations, {} prices in {}ms",
                    failedCount, total, emptyCities.get(), skippedCold.get(),
                    totalStations.get(), totalPrices.get(), duration);
        } else {
            log.info("Collection complete: {} stations, {} prices, {}/{} failed, {} empty, {} cold-skipped in {}ms",
                    totalStations.get(), totalPrices.get(), failedCount, total,
                    emptyCities.get(), skippedCold.get(), duration);
        }
        return CollectionResult.success(totalStations.get(), totalPrices.get(), duration);
    }

    /**
     * Daemon thread factory with a stable name prefix so JVM stack traces
     * make it obvious which thread is doing what. We avoid the default
     * factory because its threads are non-daemon and would block JVM exit
     * during graceful shutdown.
     */
    private static ThreadFactory daemonThreadFactory(String prefix) {
        AtomicInteger counter = new AtomicInteger();
        return r -> {
            Thread t = new Thread(r, prefix + "-" + counter.incrementAndGet());
            t.setDaemon(true);
            return t;
        };
    }

    /**
     * Collects prices for a specific area and persists them.
     */
    @Transactional
    public CollectionResult collectForArea(double lat, double lng, String cityName) {
        long start = System.currentTimeMillis();
        List<TankerkoenigResponse.Station> stations = tankerkoenigClient.searchStations(lat, lng, radiusKm);

        if (stations.isEmpty()) {
            return CollectionResult.success(0, 0, System.currentTimeMillis() - start);
        }

        LocalDateTime now = LocalDateTime.now();
        int priceCount = 0;

        for (TankerkoenigResponse.Station s : stations) {
            // Upsert station metadata
            StationMeta meta = stationRepo.findById(s.id()).orElse(new StationMeta());
            meta.setId(s.id());
            meta.setName(s.name());
            meta.setBrand(s.brand() != null ? s.brand() : "");
            meta.setLat(s.lat());
            meta.setLng(s.lng());
            meta.setStreet(s.street());
            meta.setCity(s.place());
            meta.setPostCode(s.postCode());
            meta.setLastSeen(now);
            stationRepo.save(meta);

            // Save price snapshots and emit a delta event when the
            // value actually changed vs. the most recent persisted price.
            if (s.diesel() != null && s.diesel() > 0) {
                if (persistAndPublishIfChanged(s, "diesel", s.diesel(), now, meta)) priceCount++;
            }
            if (s.e5() != null && s.e5() > 0) {
                if (persistAndPublishIfChanged(s, "e5", s.e5(), now, meta)) priceCount++;
            }
            if (s.e10() != null && s.e10() > 0) {
                if (persistAndPublishIfChanged(s, "e10", s.e10(), now, meta)) priceCount++;
            }
        }

        long duration = System.currentTimeMillis() - start;
        log.info("Collected {} prices from {} stations in {} ({}ms)",
                priceCount, stations.size(), cityName, duration);
        return CollectionResult.success(stations.size(), priceCount, duration);
    }

    /**
     * Persist a snapshot and emit a {@link PriceUpdatedEvent} only if
     * the new value differs from the most recent persisted price for
     * the same (station, fuel) pair. This stops the streaming bus from
     * being filled with repeats — Tankerkönig polls every 5 minutes
     * but actual prices change far less often.
     *
     * <p>The event is sent <i>after</i> the snapshot is persisted, so
     * a successful event implies a successful save. Order of operations
     * matters: if Kafka throws (it won't — the publisher is defensive)
     * the snapshot still landed and a subsequent poll would re-emit.</p>
     *
     * @return true if a snapshot was persisted (always, currently)
     */
    private boolean persistAndPublishIfChanged(
            TankerkoenigResponse.Station s, String fuelType, double newPrice,
            LocalDateTime now, StationMeta meta) {

        Optional<PriceSnapshot> previous =
                snapshotRepo.findFirstByStationIdAndFuelTypeOrderByTimestampDesc(s.id(), fuelType);

        snapshotRepo.save(new PriceSnapshot(s.id(), fuelType, newPrice, now));

        Double prevPrice = previous.map(PriceSnapshot::getPrice).orElse(null);
        boolean changed = (prevPrice == null) || Math.abs(prevPrice - newPrice) > 0.0009;
        if (changed) {
            priceEventPublisher.publish(PriceUpdatedEvent.forUpdate(
                    s.id(),
                    meta.getName(),
                    meta.getBrand() == null ? "" : meta.getBrand().toLowerCase(),
                    fuelType,
                    newPrice,
                    prevPrice,
                    now.toInstant(ZoneOffset.UTC),
                    meta.getLat(),
                    meta.getLng(),
                    meta.getPostCode()
            ));
        }
        return true;
    }

    /**
     * Deletes price snapshots older than the configured retention period.
     */
    @Transactional
    public int cleanupOldData() {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(maxHistoryDays);
        int deleted = snapshotRepo.deleteByTimestampBefore(cutoff);
        log.info("Cleaned up {} old price snapshots (older than {} days)", deleted, maxHistoryDays);
        return deleted;
    }

    /** City coordinate record. */
    public record CityCoord(String name, double lat, double lng) {}

    /**
     * Loads the polling grid from {@code cities.csv} on the classpath.
     *
     * <p>Format: one row per city — {@code name,lat,lng}. Blank lines and
     * lines starting with {@code #} are skipped. Malformed rows log a
     * WARN and are skipped; we never abort startup over a single bad
     * row because the rest of the grid is still useful.</p>
     *
     * <p>Called once from the {@code static} initialiser; the resulting
     * list is wrapped in {@link Collections#unmodifiableList(List)} so
     * accidental mutation downstream surfaces as an exception.</p>
     */
    private static List<CityCoord> loadCitiesFromClasspath() {
        List<CityCoord> out = new ArrayList<>(5_000);
        ClassLoader cl = PriceCollectorService.class.getClassLoader();
        try (InputStream is = cl.getResourceAsStream("cities.csv")) {
            if (is == null) {
                LoggerFactory.getLogger(PriceCollectorService.class)
                        .error("cities.csv missing from classpath — collection will be a no-op");
                return List.of();
            }
            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(is, StandardCharsets.UTF_8))) {
                String line;
                int lineNo = 0;
                while ((line = br.readLine()) != null) {
                    lineNo++;
                    String trimmed = line.trim();
                    if (trimmed.isEmpty() || trimmed.startsWith("#")) continue;
                    String[] parts = trimmed.split(",", 4);
                    if (parts.length < 3) {
                        LoggerFactory.getLogger(PriceCollectorService.class)
                                .warn("cities.csv:{} malformed — expected 'name,lat,lng', got '{}'",
                                        lineNo, trimmed);
                        continue;
                    }
                    try {
                        out.add(new CityCoord(
                                parts[0].trim(),
                                Double.parseDouble(parts[1].trim()),
                                Double.parseDouble(parts[2].trim())
                        ));
                    } catch (NumberFormatException nfe) {
                        LoggerFactory.getLogger(PriceCollectorService.class)
                                .warn("cities.csv:{} bad number — '{}'", lineNo, trimmed);
                    }
                }
            }
        } catch (IOException ioe) {
            // Reading from a classpath resource shouldn't fail in a
            // healthy container — this branch is mostly for tests.
            LoggerFactory.getLogger(PriceCollectorService.class)
                    .error("Failed to read cities.csv: {}", ioe.getMessage());
        }
        LoggerFactory.getLogger(PriceCollectorService.class)
                .info("Loaded {} polling points from cities.csv", out.size());
        return Collections.unmodifiableList(out);
    }
}
