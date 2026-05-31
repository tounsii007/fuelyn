package com.fuelyn.ai.signals;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import com.fuelyn.ai.model.AIAdvisorRequest;
import com.fuelyn.ai.model.AIAdvisorResponse;

/**
 * Quantile forecast (p10 / p50 / p90) for the next 24 h per station.
 *
 * <p>Approach: combine the EWMA-trend slope with the {@link BayesianPrior} day-×-hour discount
 * table to project a most-likely path; widen with the historical bucket σ to produce p10 and p90
 * envelopes.
 *
 * <p>This is intentionally simple — a real production model would use per-station regression. As a
 * transparency feature it's already very useful: the response can show "Aral now 1.79; expected
 * 1.74–1.78 within 24 h" so the user can reason about the suggestion.
 */
public final class StationForecaster {

    private StationForecaster() {}

    public static List<AIAdvisorResponse.StationForecast> forecast(
            List<AIAdvisorRequest.StationPrice> prices,
            EwmaChangePoint.Result trend,
            LocalDateTime now) {
        if (prices == null || prices.isEmpty()) return List.of();

        List<AIAdvisorResponse.StationForecast> out = new ArrayList<>(prices.size());
        // Project across the day-hour grid for the next 24 h
        for (var p : prices) {
            double cur = p.price();
            // 24 h drift from EWMA trend
            double drift = trend.slopePerDay();

            // Sample a coarse path: same-time-tomorrow expected discount
            double tomorrowDiscountCt = lookupNextDayBestBucket(now);
            // Convert ct → € and apply on top of current price as the floor.
            double expectedFloor = cur + tomorrowDiscountCt / 100.0 + drift;

            // p50: average of current and expected next trough.
            double p50 = (cur + expectedFloor) / 2.0;

            // Spread informed by trend strength — when we're in a clear
            // direction the envelope is tighter.
            double envelope = (1.0 - trend.strength()) * 0.03 + 0.005; // 0.5–3.5 ct
            double p10 = p50 - envelope;
            double p90 = p50 + envelope;

            // Never forecast a negative or absurdly high price
            p10 = Math.max(0.5, p10);
            p90 = Math.min(cur + 0.30, p90);

            out.add(
                    new AIAdvisorResponse.StationForecast(
                            p.stationName(), cur, round3(p10), round3(p50), round3(p90)));
        }
        return out;
    }

    /**
     * Returns the deepest discount (in ct, negative) the prior table predicts in the next 24 h. We
     * scan the next 24 hour-buckets starting from now+1.
     */
    private static double lookupNextDayBestBucket(LocalDateTime now) {
        double best = 0;
        for (int h = 1; h <= 24; h++) {
            LocalDateTime t = now.plusHours(h);
            double observedZero = 0;
            BayesianPrior.Posterior post = BayesianPrior.at(t, observedZero);
            if (post.priorMean() < best) best = post.priorMean();
        }
        return best;
    }

    private static double round3(double v) {
        return Math.round(v * 1000.0) / 1000.0;
    }
}
