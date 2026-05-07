package com.tankpilot.api.service;

import com.tankpilot.api.model.dto.CollectionResult;
import com.tankpilot.api.model.dto.TankerkoenigResponse.TankerkoenigPrices;
import com.tankpilot.api.model.dto.TankerkoenigResponse.TankerkoenigStation;
import com.tankpilot.api.model.entity.CollectionRun;
import com.tankpilot.api.model.entity.PriceSnapshot;
import com.tankpilot.api.model.entity.StationMeta;
import com.tankpilot.api.repository.CollectionRunRepository;
import com.tankpilot.api.repository.PriceSnapshotRepository;
import com.tankpilot.api.repository.StationMetaRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Service
public class PriceCollectorService {

    private static final Logger log = LoggerFactory.getLogger(PriceCollectorService.class);

    private final TankerkoenigClient tankerkoenigClient;
    private final PriceSnapshotRepository priceSnapshotRepository;
    private final StationMetaRepository stationMetaRepository;
    private final CollectionRunRepository collectionRunRepository;

    private record CityCoords(String name, double lat, double lng) {
    }

    private static final List<CityCoords> COLLECTION_CITIES = List.of(
            new CityCoords("Berlin", 52.5200, 13.4050),
            new CityCoords("Hamburg", 53.5511, 9.9937),
            new CityCoords("Muenchen", 48.1351, 11.5820),
            new CityCoords("Koeln", 50.9375, 6.9603),
            new CityCoords("Frankfurt", 50.1109, 8.6821),
            new CityCoords("Stuttgart", 48.7758, 9.1829),
            new CityCoords("Duesseldorf", 51.2277, 6.7735),
            new CityCoords("Leipzig", 51.3397, 12.3731),
            new CityCoords("Dortmund", 51.5136, 7.4653),
            new CityCoords("Nuernberg", 49.4521, 11.0767)
    );

    public PriceCollectorService(TankerkoenigClient tankerkoenigClient,
                                 PriceSnapshotRepository priceSnapshotRepository,
                                 StationMetaRepository stationMetaRepository,
                                 CollectionRunRepository collectionRunRepository) {
        this.tankerkoenigClient = tankerkoenigClient;
        this.priceSnapshotRepository = priceSnapshotRepository;
        this.stationMetaRepository = stationMetaRepository;
        this.collectionRunRepository = collectionRunRepository;
    }

    @Transactional
    public CollectionResult collectAll() {
        long startTime = System.currentTimeMillis();
        CollectionRun run = CollectionRun.start();
        collectionRunRepository.save(run);

        Set<String> collectedStationIds = new HashSet<>();
        int totalPrices = 0;

        try {
            for (CityCoords city : COLLECTION_CITIES) {
                log.info("Collecting prices for {}", city.name());
                try {
                    int prices = collectForCity(city, collectedStationIds);
                    totalPrices += prices;
                } catch (Exception e) {
                    log.warn("Failed to collect for {}: {}", city.name(), e.getMessage());
                }
            }

            run.complete(collectedStationIds.size(), totalPrices);
            collectionRunRepository.save(run);

            long duration = System.currentTimeMillis() - startTime;
            log.info("Collection complete: {} stations, {} prices in {} ms",
                    collectedStationIds.size(), totalPrices, duration);
            return CollectionResult.success(collectedStationIds.size(), totalPrices, duration);

        } catch (Exception e) {
            long duration = System.currentTimeMillis() - startTime;
            log.error("Collection failed: {}", e.getMessage(), e);
            run.fail(e.getMessage());
            collectionRunRepository.save(run);
            return CollectionResult.failure(e.getMessage(), duration);
        }
    }

    @Transactional
    public CollectionResult collectForArea(double lat, double lng, double radiusKm) {
        long startTime = System.currentTimeMillis();
        Set<String> collectedStationIds = new HashSet<>();

        try {
            List<TankerkoenigStation> stations = tankerkoenigClient.searchStations(lat, lng, radiusKm);
            int totalPrices = saveStationsAndPrices(stations, collectedStationIds);

            long duration = System.currentTimeMillis() - startTime;
            return CollectionResult.success(collectedStationIds.size(), totalPrices, duration);

        } catch (Exception e) {
            long duration = System.currentTimeMillis() - startTime;
            log.error("Area collection failed: {}", e.getMessage(), e);
            return CollectionResult.failure(e.getMessage(), duration);
        }
    }

    private int collectForCity(CityCoords city, Set<String> collectedStationIds) {
        List<TankerkoenigStation> stations = tankerkoenigClient.searchStations(
                city.lat(), city.lng(), 10.0);
        return saveStationsAndPrices(stations, collectedStationIds);
    }

    private int saveStationsAndPrices(List<TankerkoenigStation> stations,
                                      Set<String> collectedStationIds) {
        int priceCount = 0;
        LocalDateTime now = LocalDateTime.now();

        for (TankerkoenigStation station : stations) {
            if (station.id() == null) continue;

            // Save/update station metadata
            StationMeta meta = new StationMeta(
                    station.id(),
                    station.name(),
                    station.brand(),
                    station.lat(),
                    station.lng(),
                    station.street(),
                    station.place(),
                    station.postCode()
            );
            meta.setUpdatedAt(now);
            stationMetaRepository.save(meta);
            collectedStationIds.add(station.id());

            // Save price snapshots for each fuel type
            if (station.diesel() != null && station.diesel() > 0) {
                priceSnapshotRepository.save(
                        new PriceSnapshot(station.id(), "diesel", station.diesel(), now));
                priceCount++;
            }
            if (station.e5() != null && station.e5() > 0) {
                priceSnapshotRepository.save(
                        new PriceSnapshot(station.id(), "e5", station.e5(), now));
                priceCount++;
            }
            if (station.e10() != null && station.e10() > 0) {
                priceSnapshotRepository.save(
                        new PriceSnapshot(station.id(), "e10", station.e10(), now));
                priceCount++;
            }
        }

        return priceCount;
    }
}
