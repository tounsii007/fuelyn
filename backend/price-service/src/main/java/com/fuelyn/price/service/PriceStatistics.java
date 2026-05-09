package com.fuelyn.price.service;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.fuelyn.price.model.entity.PriceSnapshot;

/**
 * Pure helpers that compute price statistics from in-memory snapshot lists.
 *
 * <p>Extracted from controllers and services so the math is testable in
 * isolation, has no Spring or database dependencies, and is portable across
 * H2 and Postgres (no dialect-specific SQL).
 */
public final class PriceStatistics {

    /** Default rounding precision: thousandths of a cent (3 decimal places). */
    public static final int PRICE_PRECISION = 1000;
    /** Trend half-window for "first" and "last" averages. */
    public static final int TREND_WINDOW = 3;
    /** Threshold (EUR/L) above which a trend is reported as "rising"/"falling". */
    public static final double TREND_THRESHOLD = 0.005;

    /** German day names indexed by {@link DayOfWeek#getValue()} - 1 (Mon=0..Sun=6). */
    public static final String[] DAY_NAMES_DE = {
        "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"
    };

    private PriceStatistics() {}

    public record Stats(
            double min,
            double max,
            double avg,
            double trend,
            String trendLabel,
            String cheapestDay,
            String expensiveDay,
            Map<String, Double> dayOfWeekAvg) {}

    public record StationAverage(String stationId, double avgPrice) {}

    /** Computes min/max/avg, trend (last 3 vs first 3), and day-of-week averages. */
    public static Stats compute(List<PriceSnapshot> snapshots) {
        if (snapshots == null || snapshots.isEmpty()) {
            return new Stats(0, 0, 0, 0, "stable", "N/A", "N/A", Map.of());
        }

        double min = Double.POSITIVE_INFINITY;
        double max = Double.NEGATIVE_INFINITY;
        double sum = 0;
        for (PriceSnapshot s : snapshots) {
            double p = s.getPrice();
            if (p < min) min = p;
            if (p > max) max = p;
            sum += p;
        }
        double avg = sum / snapshots.size();

        // Trend: compare first/last TREND_WINDOW points
        int n = snapshots.size();
        int window = Math.min(TREND_WINDOW, n);
        double firstAvg = avgRange(snapshots, 0, window);
        double lastAvg = avgRange(snapshots, n - window, n);
        double trend = lastAvg - firstAvg;
        String trendLabel = trend > TREND_THRESHOLD
                ? "rising"
                : trend < -TREND_THRESHOLD ? "falling" : "stable";

        // Day-of-week aggregation (portable, computed in Java)
        EnumMap<DayOfWeek, double[]> dowAcc = new EnumMap<>(DayOfWeek.class);
        for (PriceSnapshot s : snapshots) {
            LocalDateTime ts = s.getTimestamp();
            if (ts == null) continue;
            DayOfWeek dow = ts.getDayOfWeek();
            double[] acc = dowAcc.computeIfAbsent(dow, k -> new double[] {0, 0});
            acc[0] += s.getPrice();
            acc[1] += 1;
        }

        Map<String, Double> dayOfWeekAvg = new HashMap<>();
        String cheapestDay = "N/A";
        String expensiveDay = "N/A";
        double cheapestPrice = Double.POSITIVE_INFINITY;
        double expensivePrice = Double.NEGATIVE_INFINITY;
        for (Map.Entry<DayOfWeek, double[]> e : dowAcc.entrySet()) {
            double dowAvg = e.getValue()[0] / e.getValue()[1];
            String name = DAY_NAMES_DE[e.getKey().getValue() - 1];
            dayOfWeekAvg.put(name, round(dowAvg));
            if (dowAvg < cheapestPrice) {
                cheapestPrice = dowAvg;
                cheapestDay = name;
            }
            if (dowAvg > expensivePrice) {
                expensivePrice = dowAvg;
                expensiveDay = name;
            }
        }

        return new Stats(
                round(min),
                round(max),
                round(avg),
                round(trend),
                trendLabel,
                cheapestDay,
                expensiveDay,
                dayOfWeekAvg);
    }

    /** Groups snapshots by station and computes per-station average. */
    public static List<StationAverage> stationAverages(List<PriceSnapshot> snapshots) {
        Map<String, double[]> acc = new HashMap<>();
        for (PriceSnapshot s : snapshots) {
            double[] entry = acc.computeIfAbsent(s.getStationId(), k -> new double[] {0, 0});
            entry[0] += s.getPrice();
            entry[1] += 1;
        }
        return acc.entrySet().stream()
                .map(e -> new StationAverage(e.getKey(), e.getValue()[0] / e.getValue()[1]))
                .sorted((a, b) -> Double.compare(a.avgPrice(), b.avgPrice()))
                .toList();
    }

    /** Pair of cheapest and most expensive station-average — both never null when present. */
    public record MinMaxStations(StationAverage cheapest, StationAverage mostExpensive) {}

    /**
     * Single-pass O(n) variant for callers that only need the cheapest
     * and most-expensive station average — i.e. the area-stats response
     * which previously called {@link #stationAverages} (O(n log n) due
     * to the sort) and then read just element 0 and element {@code n-1}.
     *
     * <p>Returns {@link Optional#empty()} when the input has no usable
     * snapshots, so callers can short-circuit cleanly without a special
     * "no data" sentinel record.</p>
     */
    public static Optional<MinMaxStations> cheapestAndMostExpensive(List<PriceSnapshot> snapshots) {
        if (snapshots == null || snapshots.isEmpty()) {
            return Optional.empty();
        }
        Map<String, double[]> acc = new HashMap<>();
        for (PriceSnapshot s : snapshots) {
            double[] entry = acc.computeIfAbsent(s.getStationId(), k -> new double[] {0, 0});
            entry[0] += s.getPrice();
            entry[1] += 1;
        }
        if (acc.isEmpty()) {
            return Optional.empty();
        }
        StationAverage cheapest = null;
        StationAverage mostExpensive = null;
        for (Map.Entry<String, double[]> e : acc.entrySet()) {
            double avg = e.getValue()[0] / e.getValue()[1];
            StationAverage current = new StationAverage(e.getKey(), avg);
            if (cheapest == null || avg < cheapest.avgPrice()) cheapest = current;
            if (mostExpensive == null || avg > mostExpensive.avgPrice()) mostExpensive = current;
        }
        return Optional.of(new MinMaxStations(cheapest, mostExpensive));
    }

    /** Geographic helper: degrees of latitude/longitude per kilometer near a given lat. */
    public record BoundingBox(double minLat, double maxLat, double minLng, double maxLng) {}

    /** WGS-84 mean meridian/parallel constant (km per degree latitude). */
    public static final double KM_PER_DEGREE_LATITUDE = 111.32;

    /** Builds an axis-aligned bounding box around (lat, lng) covering radiusKm. */
    public static BoundingBox boundingBox(double lat, double lng, double radiusKm) {
        double latDelta = radiusKm / KM_PER_DEGREE_LATITUDE;
        double lngDelta = radiusKm / (KM_PER_DEGREE_LATITUDE * Math.cos(Math.toRadians(lat)));
        return new BoundingBox(lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta);
    }

    public static double round(double value) {
        return Math.round(value * PRICE_PRECISION) / (double) PRICE_PRECISION;
    }

    private static double avgRange(List<PriceSnapshot> list, int from, int toExclusive) {
        if (toExclusive <= from) return 0;
        double sum = 0;
        for (int i = from; i < toExclusive; i++) sum += list.get(i).getPrice();
        return sum / (toExclusive - from);
    }
}
