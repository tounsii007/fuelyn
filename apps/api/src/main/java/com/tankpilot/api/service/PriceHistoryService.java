package com.tankpilot.api.service;

import com.tankpilot.api.model.dto.PriceHistoryResponse;
import com.tankpilot.api.model.dto.PriceStatsResponse;
import com.tankpilot.api.model.entity.PriceSnapshot;
import com.tankpilot.api.repository.PriceSnapshotRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

@Service
public class PriceHistoryService {

    private static final Logger log = LoggerFactory.getLogger(PriceHistoryService.class);

    private final PriceSnapshotRepository priceSnapshotRepository;

    public PriceHistoryService(PriceSnapshotRepository priceSnapshotRepository) {
        this.priceSnapshotRepository = priceSnapshotRepository;
    }

    public PriceHistoryResponse getHistory(String stationId, String fuelType, int days) {
        LocalDateTime after = LocalDateTime.now().minusDays(days);

        List<PriceSnapshot> snapshots = priceSnapshotRepository
                .findByStationIdAndFuelTypeAndTimestampAfterOrderByTimestampAsc(stationId, fuelType, after);

        List<PriceHistoryResponse.PricePoint> history = snapshots.stream()
                .map(s -> new PriceHistoryResponse.PricePoint(s.getPrice(), s.getTimestamp().toString()))
                .collect(Collectors.toList());

        PriceHistoryResponse.PriceStats stats = calculateStats(snapshots);

        return new PriceHistoryResponse(stationId, fuelType, history, stats);
    }

    public PriceStatsResponse getAreaStats(double lat, double lng, double radiusKm,
                                           String fuelType, int days) {
        LocalDateTime after = LocalDateTime.now().minusDays(days);

        List<Object[]> areaStats = priceSnapshotRepository.findAreaStats(fuelType, after);

        List<PriceStatsResponse.StationStats> stationStats = areaStats.stream()
                .map(row -> new PriceStatsResponse.StationStats(
                        (String) row[0],
                        ((Number) row[1]).doubleValue(),
                        ((Number) row[2]).doubleValue(),
                        ((Number) row[3]).doubleValue()
                ))
                .collect(Collectors.toList());

        double overallAvg = stationStats.stream()
                .mapToDouble(PriceStatsResponse.StationStats::avgPrice).average().orElse(0.0);
        double overallMin = stationStats.stream()
                .mapToDouble(PriceStatsResponse.StationStats::minPrice).min().orElse(0.0);
        double overallMax = stationStats.stream()
                .mapToDouble(PriceStatsResponse.StationStats::maxPrice).max().orElse(0.0);

        // Day of week averages (use first station as representative, or aggregate)
        Map<String, Double> dayOfWeekAverages = new LinkedHashMap<>();
        String cheapestDay = "";
        String expensiveDay = "";
        double trend = 0.0;

        if (!stationStats.isEmpty()) {
            String firstStationId = stationStats.get(0).stationId();
            try {
                List<Object[]> dowPattern = priceSnapshotRepository.findDayOfWeekPattern(
                        firstStationId, fuelType, after);

                double minDowAvg = Double.MAX_VALUE;
                double maxDowAvg = Double.MIN_VALUE;

                for (Object[] row : dowPattern) {
                    int dow = ((Number) row[0]).intValue();
                    double avgPrice = ((Number) row[1]).doubleValue();
                    String dayName = dayOfWeekName(dow);
                    dayOfWeekAverages.put(dayName, avgPrice);

                    if (avgPrice < minDowAvg) {
                        minDowAvg = avgPrice;
                        cheapestDay = dayName;
                    }
                    if (avgPrice > maxDowAvg) {
                        maxDowAvg = avgPrice;
                        expensiveDay = dayName;
                    }
                }
            } catch (Exception e) {
                log.warn("Could not calculate day-of-week pattern: {}", e.getMessage());
            }
        }

        return new PriceStatsResponse(
                fuelType, days, overallAvg, overallMin, overallMax,
                stationStats, dayOfWeekAverages, cheapestDay, expensiveDay, trend
        );
    }

    private PriceHistoryResponse.PriceStats calculateStats(List<PriceSnapshot> snapshots) {
        if (snapshots.isEmpty()) {
            return new PriceHistoryResponse.PriceStats(0, 0, 0, 0, "", "");
        }

        double min = snapshots.stream().mapToDouble(PriceSnapshot::getPrice).min().orElse(0);
        double max = snapshots.stream().mapToDouble(PriceSnapshot::getPrice).max().orElse(0);
        double avg = snapshots.stream().mapToDouble(PriceSnapshot::getPrice).average().orElse(0);

        // Simple trend: compare first half average to second half average
        double trend = 0.0;
        if (snapshots.size() >= 2) {
            int mid = snapshots.size() / 2;
            double firstHalfAvg = snapshots.subList(0, mid).stream()
                    .mapToDouble(PriceSnapshot::getPrice).average().orElse(0);
            double secondHalfAvg = snapshots.subList(mid, snapshots.size()).stream()
                    .mapToDouble(PriceSnapshot::getPrice).average().orElse(0);
            trend = secondHalfAvg - firstHalfAvg;
        }

        // Find cheapest/most expensive day of week
        Map<DayOfWeek, List<Double>> dayPrices = snapshots.stream()
                .collect(Collectors.groupingBy(
                        s -> s.getTimestamp().getDayOfWeek(),
                        Collectors.mapping(PriceSnapshot::getPrice, Collectors.toList())
                ));

        String cheapestDay = "";
        String expensiveDay = "";
        double cheapestAvg = Double.MAX_VALUE;
        double expensiveAvg = Double.MIN_VALUE;

        for (Map.Entry<DayOfWeek, List<Double>> entry : dayPrices.entrySet()) {
            double dayAvg = entry.getValue().stream().mapToDouble(d -> d).average().orElse(0);
            String dayName = entry.getKey().getDisplayName(TextStyle.FULL, Locale.GERMAN);
            if (dayAvg < cheapestAvg) {
                cheapestAvg = dayAvg;
                cheapestDay = dayName;
            }
            if (dayAvg > expensiveAvg) {
                expensiveAvg = dayAvg;
                expensiveDay = dayName;
            }
        }

        return new PriceHistoryResponse.PriceStats(min, max, avg, trend, cheapestDay, expensiveDay);
    }

    private String dayOfWeekName(int dow) {
        // H2 EXTRACT(DOW ...) returns 1=Sunday, 2=Monday, ... 7=Saturday
        return switch (dow) {
            case 1 -> "Sonntag";
            case 2 -> "Montag";
            case 3 -> "Dienstag";
            case 4 -> "Mittwoch";
            case 5 -> "Donnerstag";
            case 6 -> "Freitag";
            case 7 -> "Samstag";
            default -> "Unbekannt";
        };
    }
}
