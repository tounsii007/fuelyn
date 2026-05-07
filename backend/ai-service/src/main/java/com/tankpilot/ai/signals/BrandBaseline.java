package com.tankpilot.ai.signals;

import com.tankpilot.ai.model.AIAdvisorRequest;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Brand-relative price baseline.
 *
 * <p>German fuel brands have systemic level differences:
 * Aral/Shell/Esso typically run 2–4 ct above Star/JET/HEM. Plain
 * z-score over the whole sample treats every Aral station as
 * "expensive" when it's just normal Aral. We compute a brand-level
 * mean and surface a station's deviation <i>within its brand cluster</i>
 * — that catches the truly cheap stations in either tier.</p>
 *
 * <p>Edge case: brands with only one station can't have a meaningful
 * brand-z-score. We fall back to the global z-score for those.</p>
 */
public final class BrandBaseline {

    /** Per-brand statistics. */
    public record BrandStats(int count, double mean, double stdDev) {}

    public record Result(
            Map<String, BrandStats> perBrand,
            double globalMean,
            double globalStdDev,
            /** Brand-relative z-score of the cheapest station; clamped ±1.5. */
            double cheapestBrandZ
    ) {}

    private BrandBaseline() {}

    public static Result compute(List<AIAdvisorRequest.StationPrice> prices) {
        if (prices == null || prices.isEmpty()) {
            return new Result(Map.of(), 0, 0, 0);
        }
        // Global stats
        double globalMean = prices.stream().mapToDouble(AIAdvisorRequest.StationPrice::price).average().orElse(0);
        double globalStd  = stdDev(prices.stream().mapToDouble(AIAdvisorRequest.StationPrice::price).toArray(), globalMean);

        // Group by brand (case-insensitive, trimmed; null → "_unknown")
        Map<String, java.util.List<Double>> byBrand = new HashMap<>();
        for (var p : prices) {
            String key = (p.brand() == null || p.brand().isBlank()) ? "_unknown" : p.brand().trim().toLowerCase();
            byBrand.computeIfAbsent(key, k -> new java.util.ArrayList<>()).add(p.price());
        }

        Map<String, BrandStats> stats = new HashMap<>();
        for (var entry : byBrand.entrySet()) {
            double[] vals = entry.getValue().stream().mapToDouble(Double::doubleValue).toArray();
            double m = java.util.Arrays.stream(vals).average().orElse(0);
            double s = stdDev(vals, m);
            stats.put(entry.getKey(), new BrandStats(vals.length, m, s));
        }

        // Cheapest station's brand-relative z-score
        AIAdvisorRequest.StationPrice cheap = prices.stream()
                .min(java.util.Comparator.comparingDouble(AIAdvisorRequest.StationPrice::price))
                .orElseThrow();
        String cheapBrand = (cheap.brand() == null || cheap.brand().isBlank()) ? "_unknown" : cheap.brand().trim().toLowerCase();
        BrandStats brandStats = stats.get(cheapBrand);

        double brandZ;
        if (brandStats != null && brandStats.count() >= 2 && brandStats.stdDev() > 0) {
            brandZ = (cheap.price() - brandStats.mean()) / brandStats.stdDev();
        } else if (globalStd > 0) {
            // Singleton brand — fall back to global z (still informative)
            brandZ = (cheap.price() - globalMean) / globalStd;
        } else {
            brandZ = 0;
        }

        // Clamp to ±1.5 so a single outlier doesn't dominate downstream weighting
        brandZ = Math.max(-1.5, Math.min(1.5, brandZ));
        return new Result(stats, globalMean, globalStd, brandZ);
    }

    private static double stdDev(double[] vals, double mean) {
        if (vals.length < 2) return 0;
        double sumSq = 0;
        for (double v : vals) {
            double d = v - mean;
            sumSq += d * d;
        }
        return Math.sqrt(sumSq / vals.length);
    }
}
