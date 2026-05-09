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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

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
    private static final List<CityCoord> CITIES = List.of(
            new CityCoord("Berlin", 52.5200, 13.4050),
            new CityCoord("Hamburg", 53.5511, 9.9937),
            new CityCoord("Muenchen", 48.1351, 11.5820),
            new CityCoord("Koeln", 50.9375, 6.9603),
            new CityCoord("Frankfurt", 50.1109, 8.6821),
            new CityCoord("Stuttgart", 48.7758, 9.1829),
            new CityCoord("Duesseldorf", 51.2277, 6.7735),
            new CityCoord("Leipzig", 51.3397, 12.3731),
            new CityCoord("Dortmund", 51.5136, 7.4653),
            new CityCoord("Nuernberg", 49.4521, 11.0767)
    );

    private final TankerkoenigClient tankerkoenigClient;
    private final PriceSnapshotRepository snapshotRepo;
    private final StationMetaRepository stationRepo;
    private final CollectionRunRepository runRepo;
    private final PriceEventPublisher priceEventPublisher;
    private final double radiusKm;
    private final int maxHistoryDays;

    /**
     * Self-reference so {@link #collectAll()} can call {@link #collectForArea}
     * through the Spring proxy. A direct {@code this.collectForArea(...)} call
     * would bypass the AOP proxy and silently disable {@code @Transactional},
     * causing every {@code findById}/{@code save} to open its own implicit
     * transaction — which also nullifies {@code hibernate.jdbc.batch_size}.
     * {@code @Lazy} breaks the circular self-dependency at startup.
     */
    private final PriceCollectorService self;

    /**
     * Optional cache manager. When wired, {@link #collectAll()} clears the
     * {@code priceHistory} and {@code areaStats} caches at the end of a
     * successful cycle so the next read returns the freshly persisted data
     * instead of waiting up to 5 minutes for the TTL to expire. Optional
     * because tests may run without a configured cache type.
     */
    private final CacheManager cacheManager;

    /** Cache names that hold price-derived projections — must invalidate post-cycle. */
    private static final List<String> CACHES_DEPENDENT_ON_PRICES = List.of("priceHistory", "areaStats");

    public PriceCollectorService(
            TankerkoenigClient tankerkoenigClient,
            PriceSnapshotRepository snapshotRepo,
            StationMetaRepository stationRepo,
            CollectionRunRepository runRepo,
            PriceEventPublisher priceEventPublisher,
            @Value("${fuelyn.collection.radius-km:10}") double radiusKm,
            @Value("${fuelyn.collection.max-history-days:90}") int maxHistoryDays,
            @Lazy PriceCollectorService self,
            @Autowired(required = false) CacheManager cacheManager
    ) {
        this.tankerkoenigClient = tankerkoenigClient;
        this.snapshotRepo = snapshotRepo;
        this.stationRepo = stationRepo;
        this.runRepo = runRepo;
        this.priceEventPublisher = priceEventPublisher;
        this.radiusKm = radiusKm;
        this.maxHistoryDays = maxHistoryDays;
        this.self = self;
        this.cacheManager = cacheManager;
    }

    /**
     * Collects prices from all configured cities.
     * Each city is processed independently; partial failures do not block others.
     */
    public CollectionResult collectAll() {
        long start = System.currentTimeMillis();
        int totalStations = 0;
        int totalPrices = 0;

        CollectionRun run = new CollectionRun();
        run.setStartedAt(LocalDateTime.now());
        run.setStatus("running");
        runRepo.save(run);

        for (CityCoord city : CITIES) {
            try {
                // Routed through `self` so the @Transactional proxy actually
                // wraps the call — a direct `collectForArea(...)` would bypass
                // AOP and run every JPA op in its own auto-commit transaction.
                CollectionResult cityResult = self.collectForArea(city.lat(), city.lng(), city.name());
                totalStations += cityResult.stationsCount();
                totalPrices += cityResult.pricesCount();
            } catch (Exception e) {
                log.error("Collection failed for {}: {}", city.name(), e.getMessage());
            }
        }

        long duration = System.currentTimeMillis() - start;

        run.setCompletedAt(LocalDateTime.now());
        run.setStationsCount(totalStations);
        run.setPricesCount(totalPrices);
        run.setStatus("completed");
        runRepo.save(run);

        // Invalidate price-derived caches now that fresh data has landed.
        // Without this the @Cacheable areaStats/priceHistory results would
        // serve stale data for up to the 5-minute Caffeine TTL after every
        // cycle. Clearing here turns "5 min worst-case staleness" into
        // "always fresh after the next cycle commits".
        evictPriceDependentCaches();

        log.info("Collection complete: {} stations, {} prices in {}ms", totalStations, totalPrices, duration);
        return CollectionResult.success(totalStations, totalPrices, duration);
    }

    private void evictPriceDependentCaches() {
        if (cacheManager == null) {
            return;
        }
        for (String name : CACHES_DEPENDENT_ON_PRICES) {
            Cache cache = cacheManager.getCache(name);
            if (cache != null) {
                cache.clear();
            }
        }
    }

    /**
     * Fuel types we collect — kept as a constant so the batch lookup of
     * "latest snapshot per (station, fuel)" filters against the same set
     * the inner loop iterates. Order matches Tankerkönig response order.
     */
    private static final List<String> COLLECTED_FUEL_TYPES = List.of("diesel", "e5", "e10");

    /**
     * Collects prices for a specific area and persists them.
     *
     * <p>Hot-path optimisations vs. the naïve "per-station-find-then-save"
     * loop:</p>
     * <ul>
     *   <li>One {@code findAllById} for all StationMeta in the response,
     *       instead of N {@code findById} calls.</li>
     *   <li>One correlated-subquery lookup for the latest snapshot per
     *       {@code (station, fuel)} across the entire area, instead of
     *       up to 3N point lookups.</li>
     *   <li>{@code saveAll} on collected entity lists so Hibernate's
     *       JDBC batching kicks in inside the surrounding transaction
     *       (see {@code application.yml#hibernate.jdbc.batch_size}).</li>
     * </ul>
     */
    @Transactional
    public CollectionResult collectForArea(double lat, double lng, String cityName) {
        long start = System.currentTimeMillis();
        List<TankerkoenigResponse.Station> stations = tankerkoenigClient.searchStations(lat, lng, radiusKm);

        if (stations.isEmpty()) {
            return CollectionResult.success(0, 0, System.currentTimeMillis() - start);
        }

        // Truncate to whole-minute precision so that two scheduler nodes whose
        // ShedLock windows briefly overlap produce identical timestamps for
        // the same station/fuel — the V6 UNIQUE constraint then collapses
        // the race deterministically instead of letting both rows land.
        LocalDateTime now = LocalDateTime.now().truncatedTo(ChronoUnit.MINUTES);

        Set<String> stationIds = stations.stream()
                .map(TankerkoenigResponse.Station::id)
                .collect(Collectors.toSet());

        // Bulk pre-fetches — collapses what used to be 4N round-trips per area
        // (one findById + up to 3 findFirstByStationIdAndFuelType per station)
        // into a flat 2 queries, regardless of how many stations the area has.
        Map<String, StationMeta> existingStations = stationRepo.findAllById(stationIds).stream()
                .collect(Collectors.toMap(StationMeta::getId, m -> m));
        Map<SnapshotKey, PriceSnapshot> latestByKey = snapshotRepo
                .findLatestByStationIdsAndFuelTypes(stationIds, COLLECTED_FUEL_TYPES).stream()
                .collect(Collectors.toMap(
                        ps -> new SnapshotKey(ps.getStationId(), ps.getFuelType()),
                        ps -> ps));

        List<StationMeta> stationsToSave = new ArrayList<>(stations.size());
        List<PriceSnapshot> snapshotsToSave = new ArrayList<>(stations.size() * COLLECTED_FUEL_TYPES.size());
        List<PriceUpdatedEvent> eventsToPublish = new ArrayList<>();
        int priceCount = 0;

        for (TankerkoenigResponse.Station s : stations) {
            StationMeta meta = existingStations.getOrDefault(s.id(), new StationMeta());
            meta.setId(s.id());
            meta.setName(s.name());
            meta.setBrand(s.brand() != null ? s.brand() : "");
            meta.setLat(s.lat());
            meta.setLng(s.lng());
            meta.setStreet(s.street());
            meta.setCity(s.place());
            meta.setPostCode(s.postCode());
            meta.setLastSeen(now);
            stationsToSave.add(meta);

            if (s.diesel() != null && s.diesel() > 0
                    && stagePriceUpdate(s, "diesel", s.diesel(), now, meta, latestByKey, snapshotsToSave, eventsToPublish)) {
                priceCount++;
            }
            if (s.e5() != null && s.e5() > 0
                    && stagePriceUpdate(s, "e5", s.e5(), now, meta, latestByKey, snapshotsToSave, eventsToPublish)) {
                priceCount++;
            }
            if (s.e10() != null && s.e10() > 0
                    && stagePriceUpdate(s, "e10", s.e10(), now, meta, latestByKey, snapshotsToSave, eventsToPublish)) {
                priceCount++;
            }
        }

        // Two batched writes — one per entity type. Hibernate orders the
        // INSERT statements within each saveAll, and with batch_size=50
        // the JDBC layer groups them into multi-row INSERTs.
        stationRepo.saveAll(stationsToSave);
        if (!snapshotsToSave.isEmpty()) {
            snapshotRepo.saveAll(snapshotsToSave);
        }
        // Events are emitted only after the DB commit boundary closes; for
        // now we publish post-save in-method since PriceEventPublisher is
        // best-effort fire-and-forget. A subsequent change can wire this
        // to a TransactionSynchronization for true after-commit semantics.
        for (PriceUpdatedEvent ev : eventsToPublish) {
            priceEventPublisher.publish(ev);
        }

        long duration = System.currentTimeMillis() - start;
        log.info("Collected {} prices from {} stations in {} ({}ms)",
                priceCount, stations.size(), cityName, duration);
        return CollectionResult.success(stations.size(), priceCount, duration);
    }

    /** Composite key for the per-area "latest snapshot" lookup map. */
    private record SnapshotKey(String stationId, String fuelType) {}

    /**
     * Stage a single (station, fuel) snapshot for the batched write at the
     * end of {@link #collectForArea}. Compared to the previous per-row
     * persist-and-publish helper, this method:
     * <ul>
     *   <li>Looks up the previous price from the pre-fetched map instead
     *       of issuing its own SQL — turning N×M findFirst queries into
     *       a constant-time HashMap probe.</li>
     *   <li>Skips the bucket-equality case (same minute already persisted)
     *       to avoid a guaranteed UNIQUE-constraint violation.</li>
     *   <li>Defers persistence + Kafka emission to the caller, so the
     *       whole area can be committed in two saveAll batches and the
     *       events fired together.</li>
     * </ul>
     *
     * @return {@code true} if a snapshot was queued for write,
     *         {@code false} if skipped for the bucket-equality reason.
     */
    private boolean stagePriceUpdate(
            TankerkoenigResponse.Station s, String fuelType, double newPrice,
            LocalDateTime now, StationMeta meta,
            Map<SnapshotKey, PriceSnapshot> latestByKey,
            List<PriceSnapshot> snapshotsToSave,
            List<PriceUpdatedEvent> eventsToPublish) {

        PriceSnapshot previous = latestByKey.get(new SnapshotKey(s.id(), fuelType));

        // Bucket-equality short-circuit: if the most recent persisted snapshot
        // is already for the same minute we're trying to write now, another
        // node (or a retried call) already won this bucket. Skipping here
        // avoids the UNIQUE-constraint violation that would otherwise mark
        // the surrounding transaction rollback-only.
        if (previous != null && now.equals(previous.getTimestamp())) {
            return false;
        }

        snapshotsToSave.add(new PriceSnapshot(s.id(), fuelType, newPrice, now));

        Double prevPrice = previous != null ? previous.getPrice() : null;
        boolean changed = (prevPrice == null) || Math.abs(prevPrice - newPrice) > 0.0009;
        if (changed) {
            eventsToPublish.add(PriceUpdatedEvent.forUpdate(
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
     * Conservative chunk size for the chunked retention purge. 5 000 rows
     * per DELETE keeps each transaction well under typical Postgres
     * lock-wait timeouts and lets the polling writer interleave between
     * chunks instead of getting blocked behind a multi-million-row purge.
     */
    private static final int CLEANUP_CHUNK_SIZE = 5_000;

    /**
     * Deletes price snapshots older than the configured retention period.
     *
     * <p>Performed in {@value #CLEANUP_CHUNK_SIZE}-row chunks rather than
     * a single unbounded {@code DELETE … WHERE timestamp &lt; ?}, because
     * on a 90-day-deep table the unbounded statement can hold a write
     * lock on {@code price_snapshots} for minutes — long enough to stall
     * the collection cycle and trip the Tankerkönig RateLimiter into a
     * timeout cascade. Each chunk runs in its own short transaction
     * (REQUIRES_NEW) so the loop yields between chunks.</p>
     *
     * @return total number of rows deleted across all chunks.
     */
    public int cleanupOldData() {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(maxHistoryDays);
        int totalDeleted = 0;
        int chunk;
        do {
            chunk = self.deleteRetentionChunk(cutoff, CLEANUP_CHUNK_SIZE);
            totalDeleted += chunk;
        } while (chunk == CLEANUP_CHUNK_SIZE);
        log.info("Cleaned up {} old price snapshots (older than {} days, chunk={})",
                totalDeleted, maxHistoryDays, CLEANUP_CHUNK_SIZE);
        return totalDeleted;
    }

    /**
     * Deletes one retention chunk in its own short-lived transaction.
     * Public for the @Transactional proxy boundary; not part of the
     * external API of the service.
     */
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.REQUIRES_NEW)
    public int deleteRetentionChunk(LocalDateTime cutoff, int chunkSize) {
        List<Long> ids = snapshotRepo.findIdsBeforeTimestamp(
                cutoff,
                org.springframework.data.domain.PageRequest.of(0, chunkSize));
        if (ids.isEmpty()) {
            return 0;
        }
        return snapshotRepo.deleteByIdIn(ids);
    }

    /** City coordinate record. */
    public record CityCoord(String name, double lat, double lng) {}
}
