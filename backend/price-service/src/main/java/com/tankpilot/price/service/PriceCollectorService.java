package com.tankpilot.price.service;

import com.tankpilot.price.model.dto.CollectionResult;
import com.tankpilot.price.model.dto.TankerkoenigResponse;
import com.tankpilot.price.model.entity.CollectionRun;
import com.tankpilot.price.model.entity.PriceSnapshot;
import com.tankpilot.price.model.entity.StationMeta;
import com.tankpilot.price.repository.CollectionRunRepository;
import com.tankpilot.price.repository.PriceSnapshotRepository;
import com.tankpilot.price.repository.StationMetaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

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
    private final double radiusKm;
    private final int maxHistoryDays;

    public PriceCollectorService(
            TankerkoenigClient tankerkoenigClient,
            PriceSnapshotRepository snapshotRepo,
            StationMetaRepository stationRepo,
            CollectionRunRepository runRepo,
            @Value("${tankpilot.collection.radius-km:10}") double radiusKm,
            @Value("${tankpilot.collection.max-history-days:90}") int maxHistoryDays
    ) {
        this.tankerkoenigClient = tankerkoenigClient;
        this.snapshotRepo = snapshotRepo;
        this.stationRepo = stationRepo;
        this.runRepo = runRepo;
        this.radiusKm = radiusKm;
        this.maxHistoryDays = maxHistoryDays;
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
                CollectionResult cityResult = collectForArea(city.lat(), city.lng(), city.name());
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

            // Save price snapshots for each fuel type
            if (s.diesel() != null && s.diesel() > 0) {
                snapshotRepo.save(new PriceSnapshot(s.id(), "diesel", s.diesel(), now));
                priceCount++;
            }
            if (s.e5() != null && s.e5() > 0) {
                snapshotRepo.save(new PriceSnapshot(s.id(), "e5", s.e5(), now));
                priceCount++;
            }
            if (s.e10() != null && s.e10() > 0) {
                snapshotRepo.save(new PriceSnapshot(s.id(), "e10", s.e10(), now));
                priceCount++;
            }
        }

        long duration = System.currentTimeMillis() - start;
        log.info("Collected {} prices from {} stations in {} ({}ms)",
                priceCount, stations.size(), cityName, duration);
        return CollectionResult.success(stations.size(), priceCount, duration);
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
