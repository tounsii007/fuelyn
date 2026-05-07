package com.tankpilot.ai.fallback;

import com.tankpilot.ai.model.AIAdvisorRequest;
import com.tankpilot.ai.model.AIAdvisorResponse;
import com.tankpilot.ai.signals.AffiliateRebate;
import com.tankpilot.ai.signals.BayesianPrior;
import com.tankpilot.ai.signals.BrandBaseline;
import com.tankpilot.ai.signals.EwmaChangePoint;
import com.tankpilot.ai.signals.PriceFreshness;
import com.tankpilot.ai.signals.RoutePenalty;
import com.tankpilot.ai.signals.StationForecaster;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Multi-signal advisor heuristic.
 *
 * <p>Eight independent signals contribute to a buy/wait vote. Each one
 * lives in roughly [-1, +1] (positive = buy bias) and is multiplied by
 * an empirically tuned weight. Output now also exposes the per-signal
 * contributions through {@link AIAdvisorResponse#breakdown()} so the
 * client can render an "explainable AI" view and developers can debug
 * any single decision.</p>
 *
 * <h3>Signals</h3>
 * <ol>
 *   <li><b>Brand-relative z-score</b> — cheapest station within its
 *       brand cluster (handles the systemic Aral/Shell premium)</li>
 *   <li><b>Spread factor</b> — wide market dispersion → real saving</li>
 *   <li><b>EWMA trend</b> — direction + strength of last-24 h slope</li>
 *   <li><b>Change-point</b> — recent drop = market just reset</li>
 *   <li><b>Day curve</b> — Mon..Sun cheap/expensive map</li>
 *   <li><b>Hour curve</b> — diurnal pattern</li>
 *   <li><b>Bayesian posterior</b> — prior bucket vs. observed</li>
 *   <li><b>Tank urgency</b> — when we know fuel level, low tank pulls
 *       toward buy_now (waiting becomes risky)</li>
 * </ol>
 *
 * <p>Each price is also weighted by {@link PriceFreshness} so stale
 * Tankerkönig data exerts less influence on the final decision.</p>
 */
public final class LocalHeuristicFallback {

    /** Round-trip energy cost factor (€/km) used when no vehicle profile. */
    private static final double DEFAULT_DRIVE_COST_PER_KM = 0.18;
    /** Buy-vs-wait deadband. */
    private static final double DECISION_DEADBAND = 0.15;

    private LocalHeuristicFallback() {}

    public static AIAdvisorResponse analyze(AIAdvisorRequest request) {
        return analyze(request, Clock.systemDefaultZone());
    }

    public static AIAdvisorResponse analyze(AIAdvisorRequest request, Clock clock) {
        List<AIAdvisorRequest.StationPrice> prices = request.prices();
        if (prices == null || prices.isEmpty()) {
            return defaultResponse(request.fillUpLiters());
        }

        int liters = request.fillUpLiters() == null ? 50 : request.fillUpLiters();
        boolean userOptedIntoLoyalty = request.vehicleProfile() != null;

        // ── Per-station effective price including drive cost + rebate ──
        AIAdvisorRequest.StationPrice effectiveBest = prices.stream()
                .min(Comparator.comparingDouble(p -> effectivePrice(p, liters, request)))
                .orElseThrow();
        AIAdvisorRequest.StationPrice cheapest = prices.stream()
                .min(Comparator.comparingDouble(AIAdvisorRequest.StationPrice::price))
                .orElseThrow();
        boolean detourPaysOff = !effectiveBest.stationName().equals(cheapest.stationName());

        // ── Market statistics ──────────────────────────────────────
        BrandBaseline.Result brandStats = BrandBaseline.compute(prices);
        double minPrice = cheapest.price();
        double maxPrice = prices.stream().mapToDouble(AIAdvisorRequest.StationPrice::price).max().orElse(minPrice);
        double mean = brandStats.globalMean();
        double spread = maxPrice - minPrice;

        // Discount of the cheapest in cents below daily mean — input to the prior
        double observedDiscountCt = (minPrice - mean) * 100.0;

        // ── Trend + change-point ───────────────────────────────────
        EwmaChangePoint.Result trend = EwmaChangePoint.analyse(request.priceHistory());

        // ── Temporal signals ───────────────────────────────────────
        DayOfWeek dow = LocalDate.now(clock).getDayOfWeek();
        int hour = LocalTime.now(clock).getHour();
        double dayScore = dayCurve(dow);
        double hourScore = hourCurve(hour);
        BayesianPrior.Posterior posterior = BayesianPrior.at(LocalDateTime.now(clock), observedDiscountCt);

        // ── Tank urgency (only when we know current fuel level) ────
        double tankUrgency = computeTankUrgency(request.vehicleProfile());

        // ── Freshness-weighted average bias on signal strengths ────
        double avgFreshness = prices.stream()
                .mapToDouble(p -> PriceFreshness.weightOf(p, clock))
                .average().orElse(0.7);

        // ── Weighted decision (each contribution stored for breakdown) ──
        Map<String, Double> breakdown = new LinkedHashMap<>();

        // 1) Brand-relative z-score (cheap → buy)
        double zClamped = brandStats.cheapestBrandZ();
        double spreadFactor = Math.min(1.0, spread / 0.10);
        double zWeight = 1.4 * Math.max(0.2, spreadFactor) * avgFreshness;
        double zContribution = zClamped < 0
                ? -zClamped * zWeight
                : -zClamped * 0.8;
        breakdown.put("brandZScore", round3(zContribution));

        // 2) Spread factor (always buy-positive when wide)
        double spreadContribution = spreadFactor * 0.6 * avgFreshness;
        breakdown.put("spread", round3(spreadContribution));

        // 3) Day curve
        double dayContribution = dayScore > 0 ? -dayScore * 1.0 : -dayScore * 0.8;
        breakdown.put("dayOfWeek", round3(dayContribution));

        // 4) Hour curve
        double hourContribution = hourScore > 0 ? -hourScore * 0.7 : -hourScore * 0.6;
        breakdown.put("hourOfDay", round3(hourContribution));

        // 5) Trend (EWMA)
        double trendContribution = switch (trend.direction()) {
            case RISING  ->  0.9 * trend.strength();
            case FALLING -> -0.9 * trend.strength();
            case STABLE  ->  0.0;
        };
        breakdown.put("trend", round3(trendContribution));

        // 6) Change-point
        double changePointContribution = switch (trend.changePoint()) {
            // A recent drop just reset the market — don't wait, take it
            case RECENT_DROP  -> 0.6 * Math.max(0, 1.0 - trend.hoursSinceChange() / 6.0);
            // A spike means the market is rising under our feet
            case RECENT_SPIKE -> 0.4 * Math.max(0, 1.0 - trend.hoursSinceChange() / 6.0);
            case NONE         -> 0.0;
        };
        breakdown.put("changePoint", round3(changePointContribution));

        // 7) Bayesian posterior tilt
        double bayesContribution = 0.7 * posterior.tilt();
        breakdown.put("bayesianPrior", round3(bayesContribution));

        // 8) Tank urgency
        double urgencyContribution = tankUrgency * 1.2;
        breakdown.put("tankUrgency", round3(urgencyContribution));

        // ── Sum into buy/wait totals ────────────────────────────────
        double buyScore = 0;
        double waitScore = 0;
        for (var v : breakdown.values()) {
            if (v >= 0) buyScore += v; else waitScore += -v;
        }

        boolean shouldBuy = (buyScore - waitScore) > DECISION_DEADBAND;
        String action = shouldBuy ? "buy_now" : "wait";
        breakdown.put("__net", round3(buyScore - waitScore));

        // ── Confidence (data depth × signal alignment × freshness) ──
        String confidence = computeConfidence(
                prices.size(), trend, Math.abs(zClamped),
                Math.abs(buyScore - waitScore), avgFreshness);

        // ── Savings estimate (preserved contract) ───────────────────
        double savings = Math.round(spread * liters * 100.0) / 100.0;

        // ── Narrative ──────────────────────────────────────────────
        String headline;
        String explanation;
        if (shouldBuy) {
            headline = trend.changePoint() == EwmaChangePoint.ChangePoint.RECENT_DROP ? "Jetzt — Preise gerade gefallen"
                     : trend.direction() == EwmaChangePoint.Direction.RISING            ? "Jetzt tanken — Trend steigt"
                     : detourPaysOff                                                    ? "Jetzt tanken (kurzer Weg)"
                     :                                                                    "Jetzt tanken!";
            explanation = String.format(Locale.GERMANY,
                    "Günstigster Preis %.3f € bei %s%s. %s%s",
                    minPrice,
                    cheapest.stationName(),
                    brandStats.cheapestBrandZ() < 0 && brandStats.globalStdDev() > 0
                            ? String.format(Locale.GERMANY, " (%.1f σ unter dem Brand-Schnitt)", -brandStats.cheapestBrandZ())
                            : "",
                    isCheapDay(dow) ? "Dienstag/Mittwoch sind erfahrungsgemäß günstig. " : "",
                    trend.direction() == EwmaChangePoint.Direction.RISING
                            ? String.format(Locale.GERMANY, "Trend +%.1f ct/Tag.", trend.slopePerDay() * 100)
                            : "").trim();
        } else if (trend.direction() == EwmaChangePoint.Direction.FALLING) {
            headline = "Warten — Preise fallen";
            explanation = String.format(Locale.GERMANY,
                    "Trend %.1f ct/Tag — die Preise fallen. Aktuell %.3f € im Schnitt.",
                    trend.slopePerDay() * 100, mean);
        } else if (isExpensiveDay(dow)) {
            headline = "Warten lohnt sich";
            explanation = "Freitag/Samstag sind erfahrungsgemäß teurer. Versuche es Dienstag oder Mittwoch.";
        } else {
            headline = "Warten lohnt sich";
            explanation = String.format(Locale.GERMANY,
                    "Markt ist eng (Spanne %.1f ct, %d Stationen). Aktuell kein klarer Spar-Vorteil — Durchschnitt %.3f €.",
                    spread * 100, prices.size(), mean);
        }

        String priceOutlook = priceOutlookText(trend, dow, hour, posterior);
        String tip = tipText(detourPaysOff, effectiveBest, cheapest, dow, hour, request.vehicleProfile());
        String bestTimePrediction = bestTimeText(dow, hour, trend);

        AIAdvisorResponse.BestStation bestStation = new AIAdvisorResponse.BestStation(
                cheapest.stationName(),
                String.format(Locale.GERMANY, "Günstigster Preis: %.3f €, %.1f km entfernt", minPrice, cheapest.distance())
        );
        AIAdvisorResponse.BestStation effectiveBestDto = new AIAdvisorResponse.BestStation(
                effectiveBest.stationName(),
                String.format(Locale.GERMANY,
                        "Effektivpreis %.3f € (Listpreis %.3f € + %.1f km Anfahrt%s)",
                        effectivePrice(effectiveBest, liters, request),
                        effectiveBest.price(),
                        effectiveBest.distance(),
                        userOptedIntoLoyalty && AffiliateRebate.perLitre(effectiveBest.brand(), true) > 0
                                ? " − Loyalty-Bonus" : "")
        );

        // Per-station forecast
        List<AIAdvisorResponse.StationForecast> forecast =
                StationForecaster.forecast(prices, trend, LocalDateTime.now(clock));

        return new AIAdvisorResponse(
                action, headline, explanation, bestTimePrediction, savings, confidence,
                bestStation, priceOutlook, tip, false, false,
                breakdown, effectiveBestDto, forecast
        );
    }

    // ============================================================
    // Helpers
    // ============================================================

    /**
     * Effective €-per-litre at a station, including round-trip drive
     * cost amortised over the fill-up volume and any loyalty rebate.
     * Uses the user's actual consumption when known; falls back to a
     * 0.18 €/km flat estimate.
     */
    static double effectivePrice(AIAdvisorRequest.StationPrice p, int liters, AIAdvisorRequest req) {
        if (liters <= 0) return p.price();

        double driveCostPerKm = DEFAULT_DRIVE_COST_PER_KM;
        AIAdvisorRequest.VehicleProfile vp = req.vehicleProfile();
        if (vp != null && vp.consumptionL100km() != null && vp.consumptionL100km() > 0) {
            // Drive cost = consumption(L/100km) × price(€/L) / 100 km
            driveCostPerKm = (vp.consumptionL100km() / 100.0) * p.price();
        }

        // Distance: detour if destination known, else user-relative
        double effectiveKm = p.distance();
        if (req.destination() != null && p.lat() != null && p.lng() != null
                && req.lat() != null && req.lng() != null) {
            var detour = RoutePenalty.compute(req.lat(), req.lng(), p, req.destination());
            effectiveKm = detour.extraKm();
        }

        // Loyalty rebate (only when the user opted in)
        double rebate = AffiliateRebate.perLitre(p.brand(), vp != null);
        return p.price() - rebate + (2.0 * effectiveKm * driveCostPerKm) / liters;
    }

    /**
     * Tank urgency in [0,1]. 0 = full tank, 1 = below 15 % (drive
     * to nearest, don't wait). Linear taper between.
     */
    static double computeTankUrgency(AIAdvisorRequest.VehicleProfile vp) {
        if (vp == null || vp.fuelLevel() == null) return 0.0;
        double level = Math.max(0, Math.min(1, vp.fuelLevel()));
        if (level >= 0.50) return 0.0;       // comfortable
        if (level <= 0.15) return 1.0;       // urgent
        // Map [0.15, 0.50] linearly to [1, 0]
        return (0.50 - level) / (0.50 - 0.15);
    }

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

    static double hourCurve(int hour) {
        if (hour >= 6 && hour <= 8)   return 1.0;
        if (hour == 9)                return 0.6;
        if (hour == 12 || hour == 13) return 0.4;
        if (hour >= 18 && hour <= 20) return -1.0;
        if (hour == 17 || hour == 21) return -0.6;
        return 0.0;
    }

    private static boolean isCheapDay(DayOfWeek dow) {
        return dow == DayOfWeek.TUESDAY || dow == DayOfWeek.WEDNESDAY;
    }

    private static boolean isExpensiveDay(DayOfWeek dow) {
        return dow == DayOfWeek.FRIDAY || dow == DayOfWeek.SATURDAY;
    }

    private static String computeConfidence(int stations, EwmaChangePoint.Result trend,
                                            double absZ, double margin, double avgFreshness) {
        boolean strongData = stations >= 20;
        boolean mediumData = stations >= 10;
        boolean strongSignal = absZ > 1.0 || margin > 1.2 || trend.strength() > 0.7
                || trend.changePoint() != EwmaChangePoint.ChangePoint.NONE;
        // Stale data only blocks promotion to "high"; default freshness
        // (0.7, no timestamps supplied) is acceptable.
        boolean staleData = avgFreshness < 0.4;

        if (strongData && strongSignal && !staleData) return "high";
        if (mediumData) return "medium";
        if (strongSignal) return "medium";
        return "low";
    }

    private static String priceOutlookText(EwmaChangePoint.Result trend, DayOfWeek dow, int hour,
                                           BayesianPrior.Posterior posterior) {
        if (trend.changePoint() == EwmaChangePoint.ChangePoint.RECENT_DROP) {
            return String.format(Locale.GERMANY,
                    "Vor %.1f h ist der Preis gefallen — ein typischer Tankerkönig-Reset, danach steigt es meist wieder.",
                    trend.hoursSinceChange());
        }
        if (trend.direction() == EwmaChangePoint.Direction.RISING) {
            return String.format(Locale.GERMANY,
                    "24 h-Trend steigend (≈ +%.1f ct/Tag) — Preise dürften weiter anziehen.",
                    trend.slopePerDay() * 100);
        }
        if (trend.direction() == EwmaChangePoint.Direction.FALLING) {
            return String.format(Locale.GERMANY,
                    "24 h-Trend fallend (≈ %.1f ct/Tag) — kurzfristig sinken die Preise.",
                    trend.slopePerDay() * 100);
        }
        if (posterior.priorMean() < -3.0) {
            return "Aktuelles Zeitfenster ist erfahrungsgemäß sehr günstig — typischer Tagesabend-Tiefpunkt.";
        }
        return "Preise fallen typischerweise dienstags/mittwochs, abends 18–20 Uhr.";
    }

    private static String tipText(boolean detourPaysOff,
                                  AIAdvisorRequest.StationPrice effectiveBest,
                                  AIAdvisorRequest.StationPrice cheapest,
                                  DayOfWeek dow,
                                  int hour,
                                  AIAdvisorRequest.VehicleProfile vp) {
        if (vp != null && vp.fuelLevel() != null && vp.fuelLevel() < 0.15) {
            return "Tank fast leer — fahre die nächstgelegene Station an, Preisoptimierung lohnt das Risiko jetzt nicht.";
        }
        if (detourPaysOff) {
            return String.format(Locale.GERMANY,
                    "Hinweis: %s ist mit %.3f € zwar nominal teurer, spart aber durch %.1f km kürzeren Weg.",
                    effectiveBest.stationName(), effectiveBest.price(),
                    Math.max(0, cheapest.distance() - effectiveBest.distance()));
        }
        if (hour >= 18 && hour <= 20) return "Du tankst bereits im günstigen Abendfenster (18–20 Uhr).";
        if (hour <= 9 && hour >= 6)  return "Tipp: morgens ist es typisch teurer — lieber zwischen 18 und 20 Uhr tanken.";
        if (isCheapDay(dow))         return "Heute ist ein erfahrungsgemäß günstiger Tag — abends 18–20 Uhr besonders.";
        return "Tanke abends zwischen 18 und 20 Uhr für die besten Preise.";
    }

    private static String bestTimeText(DayOfWeek dow, int hour, EwmaChangePoint.Result trend) {
        if (trend.direction() == EwmaChangePoint.Direction.RISING) {
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

    private static double round3(double v) {
        return Math.round(v * 1000.0) / 1000.0;
    }

    /** Public for orchestrator-level reuse. */
    public static double effectivePriceOf(AIAdvisorRequest.StationPrice p, int liters, AIAdvisorRequest req) {
        return effectivePrice(p, liters, req);
    }

    // Re-export for tests written against the previous API shape.
    public record Trend(EwmaChangePoint.Direction direction, double slopePerDay, double strength) {
        public enum Direction { RISING, FALLING, STABLE }
    }

    public static EwmaChangePoint.Result analyseTrend(List<AIAdvisorRequest.PricePoint> history) {
        return EwmaChangePoint.analyse(history);
    }

    /** Used for parsing standalone timestamps (e.g. backtest runner). */
    public static Instant parseIso(String iso) {
        try { return OffsetDateTime.parse(iso).toInstant(); }
        catch (DateTimeParseException ignored) {}
        try { return Instant.parse(iso); }
        catch (DateTimeParseException ignored) {}
        return null;
    }

    @SuppressWarnings("unused")
    private static long durationHours(Instant a, Instant b) {
        return Duration.between(a, b).toHours();
    }
}
