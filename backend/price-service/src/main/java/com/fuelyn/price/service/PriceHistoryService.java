package com.fuelyn.price.service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fuelyn.price.model.dto.PriceHistoryResponse;
import com.fuelyn.price.model.entity.PriceSnapshot;
import com.fuelyn.price.model.entity.StationMeta;
import com.fuelyn.price.repository.PriceSnapshotRepository;
import com.fuelyn.price.repository.StationMetaRepository;

/**
 * Provides price history analysis and area statistics.
 *
 * <p>Pure analysis lives in {@link PriceStatistics}; this class is the
 * Spring-aware wrapper that handles caching, repository access, and DTO
 * assembly. All math is in-Java (no DB-dialect-specific SQL) so the same
 * code works against H2 and Postgres.
 *
 * <p>{@code @Transactional(readOnly = true)} at the class level: every
 * public method is a pure read aggregation. Hibernate uses this hint to
 * skip the dirty-check sweep before query execution and to disable auto
 * flush — measurable savings on a hot endpoint that runs against the
 * shared connection pool.
 */
@Service
@Transactional(readOnly = true)
public class PriceHistoryService {

    private static final Logger log = LoggerFactory.getLogger(PriceHistoryService.class);

    private final PriceSnapshotRepository snapshotRepo;
    private final StationMetaRepository stationMetaRepo;

    public PriceHistoryService(
            PriceSnapshotRepository snapshotRepo, StationMetaRepository stationMetaRepo) {
        this.snapshotRepo = snapshotRepo;
        this.stationMetaRepo = stationMetaRepo;
    }

    /** Single-station price history with descriptive statistics. */
    @Cacheable(value = "priceHistory", key = "#stationId + ':' + #fuelType + ':' + #days")
    public PriceHistoryResponse getHistory(String stationId, String fuelType, int days) {
        LocalDateTime after = LocalDateTime.now().minusDays(days);
        List<PriceSnapshot> snapshots =
                snapshotRepo.findByStationIdAndFuelTypeAndTimestampAfterOrderByTimestampAsc(
                        stationId, fuelType, after);

        if (snapshots.isEmpty()) {
            return new PriceHistoryResponse(
                    stationId,
                    fuelType,
                    List.of(),
                    new PriceHistoryResponse.PriceStats(0, 0, 0, 0, "N/A", "N/A", Map.of()));
        }

        List<PriceHistoryResponse.PricePoint> history = snapshots.stream()
                .map(s -> new PriceHistoryResponse.PricePoint(
                        s.getPrice(), s.getTimestamp().toString()))
                .toList();

        PriceStatistics.Stats stats = PriceStatistics.compute(snapshots);

        log.debug(
                "Price history for station {}: {} snapshots, trend={}",
                stationId,
                snapshots.size(),
                stats.trend());

        return new PriceHistoryResponse(
                stationId,
                fuelType,
                history,
                new PriceHistoryResponse.PriceStats(
                        stats.min(),
                        stats.max(),
                        stats.avg(),
                        stats.trend(),
                        stats.cheapestDay(),
                        stats.expensiveDay(),
                        stats.dayOfWeekAvg()));
    }

    /**
     * Aggregated statistics for all stations within a circular area.
     *
     * <p>Result includes per-station averages, the cheapest and most expensive
     * stations (with their meta), day-of-week pattern across the area, and a
     * trend label.
     */
    @Cacheable(
            value = "areaStats",
            key = "#lat + ':' + #lng + ':' + #radiusKm + ':' + #fuelType + ':' + #days")
    public Map<String, Object> getAreaStats(
            double lat, double lng, double radiusKm, String fuelType, int days) {
        PriceStatistics.BoundingBox bbox = PriceStatistics.boundingBox(lat, lng, radiusKm);
        List<StationMeta> stationsInArea = stationMetaRepo.findByLatBetweenAndLngBetween(
                bbox.minLat(), bbox.maxLat(), bbox.minLng(), bbox.maxLng());

        if (stationsInArea.isEmpty()) {
            return Map.of(
                    "stations", 0,
                    "averagePrice", 0,
                    "fuelType", fuelType,
                    "days", days);
        }

        List<String> ids = stationsInArea.stream().map(StationMeta::getId).toList();
        LocalDateTime since = LocalDateTime.now().minusDays(days);
        List<PriceSnapshot> snapshots =
                snapshotRepo.findByStationIdInAndFuelTypeAndTimestampAfter(ids, fuelType, since);

        if (snapshots.isEmpty()) {
            return Map.of(
                    "stations", stationsInArea.size(),
                    "dataPoints", 0,
                    "fuelType", fuelType,
                    "days", days);
        }

        PriceStatistics.Stats overall = PriceStatistics.compute(snapshots);
        Map<String, StationMeta> metaById = new HashMap<>();
        stationsInArea.forEach(s -> metaById.put(s.getId(), s));

        Map<String, Object> result = new HashMap<>();
        result.put("stations", stationsInArea.size());
        result.put("dataPoints", snapshots.size());
        result.put("averagePrice", overall.avg());
        result.put("trend", overall.trendLabel());
        result.put("trendDelta", overall.trend());
        result.put("dayOfWeekPattern", overall.dayOfWeekAvg());
        result.put("cheapestDay", overall.cheapestDay());
        result.put("expensiveDay", overall.expensiveDay());
        result.put("fuelType", fuelType);
        result.put("days", days);

        // Single-pass min/max — used to be a sort + index-0/index-N read.
        PriceStatistics.cheapestAndMostExpensive(snapshots).ifPresent(mm -> {
            result.put("minStation", stationSummary(mm.cheapest(), metaById));
            result.put("maxStation", stationSummary(mm.mostExpensive(), metaById));
        });

        return result;
    }

    private static Map<String, Object> stationSummary(
            PriceStatistics.StationAverage avg, Map<String, StationMeta> metaById) {
        StationMeta meta = metaById.get(avg.stationId());
        if (meta == null) {
            return Map.of("id", avg.stationId(), "avgPrice", PriceStatistics.round(avg.avgPrice()));
        }
        return Map.of(
                "id", avg.stationId(),
                "name", meta.getName(),
                "brand", meta.getBrand(),
                "avgPrice", PriceStatistics.round(avg.avgPrice()));
    }
}
