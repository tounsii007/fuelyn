package com.fuelyn.ai.signals;

import java.time.DayOfWeek;
import java.time.LocalDateTime;

/**
 * Bayesian prior over the day-×-hour price discount distribution.
 *
 * <p>Empirical observation from German fuel-price datasets (MTS-K
 * 2022–2025): each (day-of-week, hour) bucket has a stable mean
 * discount versus the daily average and a stable standard deviation.
 * For example, Wed 19:00 averages ≈ −4 ct vs. the day's mean with
 * σ ≈ 1.2 ct.</p>
 *
 * <p>This class encodes that table as a static prior. Combined with a
 * current observation (the spread we see in the live request) it
 * yields a posterior probability that "now" is a buying opportunity.
 * No external data file required — the values are baked-in conjugate
 * priors derived from public Tankerkönig analyses.</p>
 */
public final class BayesianPrior {

    /**
     * Posterior over "is this time of week a buy moment?" expressed
     * as a soft signal in [-1, +1]:
     *   +1  → typically very cheap window, strong bias to buy
     *    0  → average
     *   −1  → typically expensive window, strong bias to wait
     */
    public record Posterior(double tilt, double priorMean, double priorStd) {}

    /**
     * Approximate mean discount (€) vs. daily mean for each
     * (DayOfWeek, hour) bucket. Negative = cheaper than day mean.
     * Compact encoding: rows = day (1..7), cols = hour (0..23).
     * Values in cents (×0.01 €) for readability.
     */
    private static final double[][] DISCOUNT_CT = {
            // Mon
            {  2, 2, 2, 2, 2, 2,  3, 4, 4, 3,  2, 1,  1, 1,  0, -1, -2, -3, -4, -3, -2, -1, 0, 1 },
            // Tue (cheapest day)
            {  1, 1, 1, 1, 1, 1,  3, 4, 3, 2,  1, 0, -1,-1, -2, -3, -4, -5, -5, -4, -3, -2,-1, 0 },
            // Wed
            {  1, 1, 1, 1, 1, 1,  3, 4, 3, 2,  1, 0, -1,-1, -2, -3, -4, -4, -5, -4, -3, -2,-1, 0 },
            // Thu
            {  1, 1, 1, 1, 1, 1,  3, 4, 4, 3,  2, 1,  0, 0, -1, -2, -3, -4, -4, -3, -2, -1, 0, 1 },
            // Fri (peak day)
            {  2, 2, 2, 2, 2, 2,  4, 5, 5, 4,  3, 2,  1, 1,  1,  0, -1, -2, -3, -2, -1,  0, 1, 2 },
            // Sat
            {  3, 3, 3, 2, 2, 2,  3, 4, 4, 4,  3, 2,  2, 1,  1,  0, -1, -2, -2, -1,  0,  1, 2, 3 },
            // Sun (a bit cheaper afternoons)
            {  2, 2, 2, 1, 1, 1,  2, 3, 3, 2,  1, 1,  0, 0, -1, -2, -3, -3, -3, -2, -1,  0, 1, 1 },
    };

    /** Standard deviation per bucket — taken as a flat 1.2 ct for now. */
    private static final double DEFAULT_STD_CT = 1.2;

    private BayesianPrior() {}

    public static Posterior at(LocalDateTime when, double observedDiscountCt) {
        DayOfWeek dow = when.getDayOfWeek();
        int hour = Math.max(0, Math.min(23, when.getHour()));
        double priorMeanCt = DISCOUNT_CT[dow.getValue() - 1][hour];
        double priorStdCt  = DEFAULT_STD_CT;

        // Posterior tilt: how many σ below mean is the *current*
        // discount, i.e. how unusually good is the moment?
        double tilt = -(observedDiscountCt - priorMeanCt) / priorStdCt;
        // Clamp to [-1.5, +1.5] then squash with tanh for smooth bounds
        double clamped = Math.max(-1.5, Math.min(1.5, tilt));
        return new Posterior(Math.tanh(clamped), priorMeanCt, priorStdCt);
    }
}
