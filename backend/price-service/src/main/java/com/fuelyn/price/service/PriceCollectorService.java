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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

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

    public PriceCollectorService(
            TankerkoenigClient tankerkoenigClient,
            PriceSnapshotRepository snapshotRepo,
            StationMetaRepository stationRepo,
            CollectionRunRepository runRepo,
            PriceEventPublisher priceEventPublisher,
            @Value("${fuelyn.collection.radius-km:10}") double radiusKm,
            @Value("${fuelyn.collection.max-history-days:90}") int maxHistoryDays,
            @Lazy PriceCollectorService self
    ) {
        this.tankerkoenigClient = tankerkoenigClient;
        this.snapshotRepo = snapshotRepo;
        this.stationRepo = stationRepo;
        this.runRepo = runRepo;
        this.priceEventPublisher = priceEventPublisher;
        this.radiusKm = radiusKm;
        this.maxHistoryDays = maxHistoryDays;
        this.self = self;
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

        log.info("Collection complete: {} stations, {} prices in {}ms", totalStations, totalPrices, duration);
        return CollectionResult.success(totalStations, totalPrices, duration);
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
}
