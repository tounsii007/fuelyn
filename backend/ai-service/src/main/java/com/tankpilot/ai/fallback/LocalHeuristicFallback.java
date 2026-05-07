package com.tankpilot.ai.fallback;

import com.tankpilot.ai.model.AIAdvisorRequest;
import com.tankpilot.ai.model.AIAdvisorResponse;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Local heuristic fallback when OpenAI API is unavailable.
 *
 * <p>The decision is a weighted vote from independent signals — never a
 * single rule. Each signal is bounded so no single input can dominate.
 *
 * <h3>Signals</h3>
 * <ol>
 *   <li><b>Z-score</b> of the cheapest station vs. the local market mean.
 *       Captures “unusually cheap” independent of absolute price level.</li>
 *   <li><b>Spread factor</b> — how dispersed the local market is. A
 *       narrow spread means the cheap pick barely matters; a wide
 *       spread makes the saving real.</li>
 *   <li><b>24 h price trend</b> from {@code priceHistory}. Linear
 *       regression slope over the most recent points classifies the
 *       direction. Rising prices push us toward {@code buy_now}.</li>
 *   <li><b>Distance-effective price</b> per station — adds the cost of
 *       the round-trip detour at a fixed €/km estimate so a 0.04 €
 *       saving 8 km away can lose to a 0.02 € saving next door.</li>
 *   <li><b>Day-of-week curve</b> — German empirical pattern (Tue/Wed
 *       trough, Fri/Sat peak), modeled as a continuous score in
 *       {@code [-1, +1]} rather than a binary flag.</li>
 *   <li><b>Time-of-day curve</b> — morning peak (06–09), midday bump
 *       (12–13), evening trough (18–21).</li>
 * </ol>
 *
 * <p>The signals are summed into {@code buyScore} vs. {@code waitScore}
 * with a deadband so the decision flips only when one side meaningfully
 * dominates. The bestStation is still the absolute cheapest by raw
 * price (so the result is stable for users), but the explanation calls
 * out when a slightly more expensive station would actually be the
 * better effective deal.
 *
 * <p>Output schema is unchanged: this is a drop-in replacement.
 */
public final class LocalHeuristicFallback {

    /** Round-trip energy cost factor (€/km) used for distance penalty. */
    private static final double DRIVE_COST_PER_KM = 0.18;
    /** Threshold where buyScore − waitScore decides the action. */
    private static final double DECISION_DEADBAND = 0.15;

    private LocalHeuristicFallback() {}

    /**
     * Analyzes the given request and returns a heuristic-based recommendation
     * using the system clock.
     */
    public static AIAdvisorResponse analyze(AIAdvisorRequest request) {
        return analyze(request, Clock.systemDefaultZone());
    }

    /**
     * Test-friendly overload — accepts a {@link Clock} so day/hour signals
     * stay deterministic in unit tests.
     */
    public static AIAdvisorResponse analyze(AIAdvisorRequest request, Clock clock) {
        List<AIAdvisorRequest.StationPrice> prices = request.prices();
        if (prices == null || prices.isEmpty()) {
            return defaultResponse(request.fillUpLiters());
        }

        int liters = request.fillUpLiters() == null ? 50 : request.fillUpLiters();

        // ─── Market statistics ──────────────────────────────────
        AIAdvisorRequest.StationPrice cheapest = prices.stream()
                .min(Comparator.comparingDouble(AIAdvisorRequest.StationPrice::price))
                .orElseThrow();
        double minPrice = cheapest.price();
        double maxPrice = prices.stream().mapToDouble(AIAdvisorRequest.StationPrice::price).max().orElse(minPrice);
        double mean = prices.stream().mapToDouble(AIAdvisorRequest.StationPrice::price).average().orElse(minPrice);
        double stdDev = stdDev(prices, mean);
        double spread = maxPrice - minPrice;
        double zScore = stdDev > 0 ? (minPrice - mean) / stdDev : 0; // negative = cheaper than mean

        // Distance-effective best pick (price + drive cost normalised per litre)
        AIAdvisorRequest.StationPrice effectiveBest = prices.stream()
                .min(Comparator.comparingDouble(p -> effectivePrice(p, liters)))
                .orElse(cheapest);
        boolean detourPaysOff = !effectiveBest.stationName().equals(cheapest.stationName());

        // ─── Temporal signals ──────────────────────────────────
        DayOfWeek dow = LocalDate.now(clock).getDayOfWeek();
        int hour = LocalTime.now(clock).getHour();
        double dayScore = dayCurve(dow);     // [-1, +1] → +1 means expensive day
        double hourScore = hourCurve(hour);  // [-1, +1] → +1 means expensive hour

        // ─── Trend signal ──────────────────────────────────────
        Trend trend = analyseTrend(request.priceHistory());

        // ─── Weighted decision ─────────────────────────────────
        // Rationale: every signal lives in roughly [-1, +1] and we
        // multiply by a weight that reflects how informative it is
        // empirically. Sum is the final tilt.
        double buyScore = 0;
        double waitScore = 0;

        // Spread first — z-score signal is gated by it. A 1.5σ-below-mean
        // station in a 0.5 ct market saves cents per fill-up; we don't
        // want that to outweigh a clear falling trend.
        double spreadFactor = Math.min(1.0, spread / 0.10); // ≥10 ct → full weight

        // Cheap z-score → buy, weighted by how meaningful the spread is.
        // Cap to ±1.5 so a single outlier station can't dominate.
        double zClamped = Math.max(-1.5, Math.min(1.5, zScore));
        double zWeight = 1.4 * Math.max(0.2, spreadFactor); // never zero, but small in tight markets
        if (zClamped < 0) buyScore += -zClamped * zWeight; else waitScore += zClamped * 0.8;

        // Wide spread amplifies the value of the cheap pick.
        buyScore += spreadFactor * 0.6;

        // Day curve: positive (expensive day) → wait
        if (dayScore > 0) waitScore += dayScore * 1.0; else buyScore += -dayScore * 0.8;

        // Hour curve: positive (expensive hour) → wait
        if (hourScore > 0) waitScore += hourScore * 0.7; else buyScore += -hourScore * 0.6;

        // Trend
        switch (trend.direction()) {
            case RISING  -> buyScore += 0.9 * trend.strength();
            case FALLING -> waitScore += 0.9 * trend.strength();
            case STABLE  -> { /* no contribution */ }
        }

        boolean shouldBuy = (buyScore - waitScore) > DECISION_DEADBAND;
        String action = shouldBuy ? "buy_now" : "wait";

        // ─── Confidence ────────────────────────────────────────
        String confidence = computeConfidence(prices.size(), trend, Math.abs(zClamped), Math.abs(buyScore - waitScore));

        // ─── Savings estimate (preserved contract) ─────────────
        double savings = Math.round(spread * liters * 100.0) / 100.0;

        // ─── Narrative ─────────────────────────────────────────
        String headline;
        String explanation;
        String priceOutlook;
        String tip;
        String bestTimePrediction;

        if (shouldBuy) {
            headline = trend.direction() == Trend.Direction.RISING ? "Jetzt tanken — Trend steigt"
                     : detourPaysOff ? "Jetzt tanken (Umweg lohnt)"
                     : "Jetzt tanken!";
            explanation = String.format(Locale.GERMANY,
                    "Günstigster Preis %.3f € bei %s%s. %s%s",
                    minPrice,
                    cheapest.stationName(),
                    stdDev > 0 ? String.format(Locale.GERMANY, " (%.1f σ unter dem Schnitt)", -zClamped) : "",
                    isCheapDay(dow) ? "Dienstag/Mittwoch sind erfahrungsgemäß günstig. " : "",
                    trend.direction() == Trend.Direction.RISING
                            ? String.format(Locale.GERMANY, "Trend +%.1f ct/Tag — eher steigend.", trend.slopePerDay() * 100)
                            : ""
            ).trim();
        } else {
            if (trend.direction() == Trend.Direction.FALLING) {
                headline = "Warten — Preise fallen";
                explanation = String.format(Locale.GERMANY,
                        "Trend −%.1f ct/Tag — die Preise fallen. Aktuell %.3f € im Schnitt.",
                        -trend.slopePerDay() * 100, mean);
            } else if (isExpensiveDay(dow)) {
                headline = "Warten lohnt sich";
                explanation = "Freitag/Samstag sind erfahrungsgemäß teurer. Versuche es Dienstag oder Mittwoch.";
            } else {
                headline = "Warten lohnt sich";
                explanation = String.format(Locale.GERMANY,
                        "Der Markt ist eng (Spanne %.1f ct, %d Stationen). Aktuell kein klarer Spar-Vorteil — Durchschnitt %.3f €.",
                        spread * 100, prices.size(), mean);
            }
        }

        priceOutlook = priceOutlookText(trend, dow, hour);
        tip = tipText(detourPaysOff, effectiveBest, cheapest, dow, hour);
        bestTimePrediction = bestTimeText(dow, hour, trend);

        AIAdvisorResponse.BestStation bestStation = new AIAdvisorResponse.BestStation(
                cheapest.stationName(),
                String.format(Locale.GERMANY, "Günstigster Preis: %.3f €, %.1f km entfernt", minPrice, cheapest.distance())
        );

        return new AIAdvisorResponse(
                action, headline, explanation, bestTimePrediction, savings, confidence,
                bestStation, priceOutlook, tip, false, false
        );
    }

    // ============================================================
    // Helpers
    // ============================================================

    private static double stdDev(List<AIAdvisorRequest.StationPrice> prices, double mean) {
        if (prices.size() < 2) return 0;
        double sumSq = 0;
        for (var p : prices) {
            double d = p.price() - mean;
            sumSq += d * d;
        }
        return Math.sqrt(sumSq / prices.size());
    }

    /**
     * Effective price per litre at a given station once the round-trip
     * detour cost is amortised across the fill-up. Formula:
     * <pre>
     *   effective = price + (2 × distanceKm × DRIVE_COST_PER_KM) / liters
     * </pre>
     */
    private static double effectivePrice(AIAdvisorRequest.StationPrice p, int liters) {
        if (liters <= 0) return p.price();
        return p.price() + (2.0 * p.distance() * DRIVE_COST_PER_KM) / liters;
    }

    /** Day-of-week curve, [-1, +1]. Negative = cheap day, positive = expensive. */
    static double dayCurve(DayOfWeek dow) {
        return switch (dow) {
            case TUESDAY   -> -1.0;
            case WEDNESDAY -> -0.6;
            case MONDAY    ->  0.0;
            case THURSDAY  ->  0.1;
            case SUNDAY    -> -0.3;
            case SATURDAY  ->  0.6;
            case FRIDAY    ->  1.0;
        };
    }

    /** Hour-of-day curve, [-1, +1]. Negative = cheap window, positive = peak. */
    static double hourCurve(int hour) {
        if (hour >= 6 && hour <= 8)   return 1.0;     // morning peak
        if (hour == 9)                return 0.6;
        if (hour == 12 || hour == 13) return 0.4;     // midday bump
        if (hour >= 18 && hour <= 20) return -1.0;    // evening trough
        if (hour == 17 || hour == 21) return -0.6;
        return 0.0;
    }

    private static boolean isCheapDay(DayOfWeek dow) {
        return dow == DayOfWeek.TUESDAY || dow == DayOfWeek.WEDNESDAY;
    }

    private static boolean isExpensiveDay(DayOfWeek dow) {
        return dow == DayOfWeek.FRIDAY || dow == DayOfWeek.SATURDAY;
    }

    /**
     * Linear regression slope of price ~ time on the most recent
     * history points. Returns slope per day plus a strength score
     * (R² × normalised magnitude) in [0, 1].
     */
    static Trend analyseTrend(List<AIAdvisorRequest.PricePoint> history) {
        if (history == null || history.size() < 4) {
            return new Trend(Trend.Direction.STABLE, 0, 0);
        }

        // Parse timestamps; skip points that fail to parse.
        long[] timesMs = new long[history.size()];
        double[] vals = new double[history.size()];
        int n = 0;
        for (var pt : history) {
            try {
                long t = OffsetDateTime.parse(pt.timestamp()).toInstant().toEpochMilli();
                timesMs[n] = t;
                vals[n] = pt.price();
                n++;
            } catch (DateTimeParseException ignored) {
                // try plain instant
                try {
                    timesMs[n] = Instant.parse(pt.timestamp()).toEpochMilli();
                    vals[n] = pt.price();
                    n++;
                } catch (DateTimeParseException ignored2) {
                    // skip point
                }
            }
        }
        if (n < 4) return new Trend(Trend.Direction.STABLE, 0, 0);

        // Use most recent 24 h or all parsed points, whichever is shorter.
        long latest = timesMs[n - 1];
        long cutoff = latest - Duration.ofHours(24).toMillis();
        // scan to find first index within cutoff
        int start = 0;
        for (int i = 0; i < n; i++) {
            if (timesMs[i] >= cutoff) { start = i; break; }
        }
        int len = n - start;
        if (len < 4) {
            // fall back to whole window
            start = 0;
            len = n;
        }

        // Linear regression: x in days since start
        double base = timesMs[start];
        double sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
        for (int i = start; i < n; i++) {
            double x = (timesMs[i] - base) / 86_400_000.0; // days
            double y = vals[i];
            sumX += x; sumY += y; sumXY += x * y; sumXX += x * x; sumYY += y * y;
        }
        double meanX = sumX / len;
        double meanY = sumY / len;
        double sxx = sumXX - len * meanX * meanX;
        double sxy = sumXY - len * meanX * meanY;
        double syy = sumYY - len * meanY * meanY;
        if (sxx == 0) return new Trend(Trend.Direction.STABLE, 0, 0);

        double slopePerDay = sxy / sxx;
        double r2 = (syy == 0) ? 0 : (sxy * sxy) / (sxx * syy);

        // Strength: combine R² and magnitude vs 1 ct/day baseline.
        double magNorm = Math.min(1.0, Math.abs(slopePerDay) / 0.01); // 1 ct/day = full weight
        double strength = Math.max(0, Math.min(1, r2 * 0.6 + magNorm * 0.4));

        // Direction needs both magnitude > 0.3 ct/day AND R² > 0.15
        Trend.Direction dir;
        if (Math.abs(slopePerDay) < 0.003 || r2 < 0.15) dir = Trend.Direction.STABLE;
        else dir = slopePerDay > 0 ? Trend.Direction.RISING : Trend.Direction.FALLING;

        return new Trend(dir, slopePerDay, strength);
    }

    private static String computeConfidence(int stations, Trend trend, double absZ, double margin) {
        boolean strongData = stations >= 20;
        boolean mediumData = stations >= 10;
        boolean strongSignal = absZ > 1.0 || margin > 1.2 || trend.strength() > 0.7;

        if (strongData && strongSignal) return "high";
        if (mediumData) return "medium";
        if (strongSignal) return "medium";
        return "low";
    }

    private static String priceOutlookText(Trend trend, DayOfWeek dow, int hour) {
        if (trend.direction() == Trend.Direction.RISING) {
            return String.format(Locale.GERMANY,
                    "24 h-Trend steigend (≈ +%.1f ct/Tag) — Preise dürften weiter anziehen.",
                    trend.slopePerDay() * 100);
        }
        if (trend.direction() == Trend.Direction.FALLING) {
            return String.format(Locale.GERMANY,
                    "24 h-Trend fallend (≈ %.1f ct/Tag) — kurzfristig sinken die Preise.",
                    trend.slopePerDay() * 100);
        }
        if (isExpensiveDay(dow) && hour >= 18) {
            return "Heute Abend wahrscheinlich noch leicht günstiger; richtig teuer wird es Freitag früh.";
        }
        return "Preise fallen typischerweise dienstags/mittwochs, abends 18–20 Uhr.";
    }

    private static String tipText(boolean detourPaysOff,
                                  AIAdvisorRequest.StationPrice effectiveBest,
                                  AIAdvisorRequest.StationPrice cheapest,
                                  DayOfWeek dow,
                                  int hour) {
        if (detourPaysOff) {
            return String.format(Locale.GERMANY,
                    "Hinweis: %s ist mit %.3f € zwar nominal teurer, spart aber durch %.1f km kürzeren Weg.",
                    effectiveBest.stationName(), effectiveBest.price(), Math.max(0, cheapest.distance() - effectiveBest.distance()));
        }
        if (hour >= 18 && hour <= 20) return "Du tankst bereits im günstigen Abendfenster (18–20 Uhr).";
        if (hour <= 9 && hour >= 6) return "Tipp: morgens ist es typisch teurer — lieber zwischen 18 und 20 Uhr tanken.";
        if (isCheapDay(dow)) return "Heute ist ein erfahrungsgemäß günstiger Tag — abends 18–20 Uhr besonders.";
        return "Tanke abends zwischen 18 und 20 Uhr für die besten Preise.";
    }

    private static String bestTimeText(DayOfWeek dow, int hour, Trend trend) {
        if (trend.direction() == Trend.Direction.RISING) {
            return "Heute, möglichst sofort — der 24-h-Trend zeigt nach oben.";
        }
        if (isCheapDay(dow) && hour >= 18 && hour <= 20) {
            return "Genau jetzt — günstiger Tag und günstige Stunde fallen zusammen.";
        }
        if (isCheapDay(dow)) return "Heute zwischen 18 und 20 Uhr.";
        return "Dienstag oder Mittwoch zwischen 18 und 20 Uhr.";
    }

    private static AIAdvisorResponse defaultResponse(Integer fillUpLiters) {
        int liters = fillUpLiters == null ? 50 : fillUpLiters;
        return new AIAdvisorResponse(
                "wait", "Keine Daten",
                "Es liegen keine Preisdaten vor. Bitte Preise abrufen oder später erneut versuchen.",
                "Preise fallen typischerweise dienstags.", 0, "low",
                null, "Unbekannt",
                String.format(Locale.GERMANY, "Vergleiche Preise vor dem Tanken (typische Füllmenge: %d L).", liters),
                false, false
        );
    }

    /** Trend descriptor returned by {@link #analyseTrend}. */
    public record Trend(Direction direction, double slopePerDay, double strength) {
        public enum Direction { RISING, FALLING, STABLE }
    }
}
