package com.fuelyn.ai.fallback;

import com.fuelyn.ai.model.AIAdvisorRequest;
import com.fuelyn.ai.model.AIAdvisorResponse;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;

class LocalHeuristicFallbackTest {

    /** Tuesday 19:00 — a day/hour pair the curves classify as cheap. */
    private static final Clock TUE_EVENING =
            Clock.fixed(LocalDateTime.of(2026, 5, 5, 19, 0).atZone(ZoneId.of("Europe/Berlin")).toInstant(),
                    ZoneId.of("Europe/Berlin"));
    /** Friday 08:00 — a day/hour pair the curves classify as expensive. */
    private static final Clock FRI_MORNING =
            Clock.fixed(LocalDateTime.of(2026, 5, 8, 8, 0).atZone(ZoneId.of("Europe/Berlin")).toInstant(),
                    ZoneId.of("Europe/Berlin"));

    // ────────────────────────────────────────────────────────────
    // Original contract (preserved)
    // ────────────────────────────────────────────────────────────

    @Test
    void analyze_returnsDefaultForEmptyPrices() {
        AIAdvisorRequest req = new AIAdvisorRequest(
                List.of(), "e10", null, 52.5, 13.4, 50
        );
        AIAdvisorResponse response = LocalHeuristicFallback.analyze(req);

        assertThat(response.action()).isEqualTo("wait");
        assertThat(response.confidence()).isEqualTo("low");
        assertThat(response.fromAI()).isFalse();
        assertThat(response.bestStation()).isNull();
    }

    @Test
    void analyze_pointsAtCheapestStation() {
        var aral = new AIAdvisorRequest.StationPrice("Aral Mitte", "Aral", 1.739, 1.2);
        var shell = new AIAdvisorRequest.StationPrice("Shell Nord", "Shell", 1.699, 2.3);
        var jet = new AIAdvisorRequest.StationPrice("JET City", "JET", 1.759, 0.9);

        AIAdvisorRequest req = new AIAdvisorRequest(
                List.of(aral, shell, jet), "e10", null, 52.5, 13.4, 50
        );

        AIAdvisorResponse response = LocalHeuristicFallback.analyze(req);

        assertThat(response.bestStation()).isNotNull();
        assertThat(response.bestStation().name()).isEqualTo("Shell Nord");
        assertThat(response.action()).isIn("buy_now", "wait");
    }

    @Test
    void analyze_savingsReflectsPriceSpread() {
        var cheap = new AIAdvisorRequest.StationPrice("A", "A", 1.600, 1.0);
        var expensive = new AIAdvisorRequest.StationPrice("B", "B", 1.800, 1.0);

        AIAdvisorRequest req = new AIAdvisorRequest(
                List.of(cheap, expensive), "e10", null, 52.5, 13.4, 50
        );

        AIAdvisorResponse response = LocalHeuristicFallback.analyze(req);

        assertThat(response.savingsEstimate()).isEqualTo(10.0);
    }

    @Test
    void analyze_confidenceScalesWithDataSize() {
        List<AIAdvisorRequest.StationPrice> many = IntStream.range(0, 10)
                .mapToObj(i -> new AIAdvisorRequest.StationPrice("S" + i, "Brand", 1.70 + i * 0.01, i))
                .toList();

        AIAdvisorRequest req = new AIAdvisorRequest(many, "e10", null, null, null, 50);

        AIAdvisorResponse response = LocalHeuristicFallback.analyze(req);

        assertThat(response.confidence()).isEqualTo("medium");
    }

    // ────────────────────────────────────────────────────────────
    // Day-of-week and hour curves (pure functions)
    // ────────────────────────────────────────────────────────────

    @Test
    void dayCurve_isCheapOnTuesdayAndExpensiveOnFriday() {
        assertThat(LocalHeuristicFallback.dayCurve(DayOfWeek.TUESDAY)).isLessThan(0);
        assertThat(LocalHeuristicFallback.dayCurve(DayOfWeek.WEDNESDAY)).isLessThan(0);
        assertThat(LocalHeuristicFallback.dayCurve(DayOfWeek.FRIDAY)).isGreaterThan(0);
        assertThat(LocalHeuristicFallback.dayCurve(DayOfWeek.SATURDAY)).isGreaterThan(0);
    }

    @Test
    void hourCurve_morningPeakAndEveningTrough() {
        assertThat(LocalHeuristicFallback.hourCurve(7)).isGreaterThan(0);   // morning peak
        assertThat(LocalHeuristicFallback.hourCurve(19)).isLessThan(0);     // evening trough
        assertThat(LocalHeuristicFallback.hourCurve(3)).isEqualTo(0);       // night neutral
    }

    // ────────────────────────────────────────────────────────────
    // Trend detection
    // ────────────────────────────────────────────────────────────

    @Test
    void trend_detectsRisingPrices() {
        var history = buildLinearHistory(1.700, 0.005, 12); // +0.5 ct / hour
        var trend = LocalHeuristicFallback.analyseTrend(history);

        assertThat(trend.direction()).isEqualTo(com.fuelyn.ai.signals.EwmaChangePoint.Direction.RISING);
        assertThat(trend.slopePerDay()).isGreaterThan(0.05); // > 5 ct/day
        assertThat(trend.strength()).isGreaterThan(0.5);
    }

    @Test
    void trend_detectsFallingPrices() {
        var history = buildLinearHistory(1.800, -0.004, 12);
        var trend = LocalHeuristicFallback.analyseTrend(history);

        assertThat(trend.direction()).isEqualTo(com.fuelyn.ai.signals.EwmaChangePoint.Direction.FALLING);
        assertThat(trend.slopePerDay()).isLessThan(0);
    }

    @Test
    void trend_treatsFlatHistoryAsStable() {
        var history = buildLinearHistory(1.749, 0.0, 12);
        var trend = LocalHeuristicFallback.analyseTrend(history);

        assertThat(trend.direction()).isEqualTo(com.fuelyn.ai.signals.EwmaChangePoint.Direction.STABLE);
    }

    @Test
    void trend_returnsStableForTooFewPoints() {
        var trend = LocalHeuristicFallback.analyseTrend(List.of(
                new AIAdvisorRequest.PricePoint(1.7, ts(0)),
                new AIAdvisorRequest.PricePoint(1.7, ts(1))
        ));
        assertThat(trend.direction()).isEqualTo(com.fuelyn.ai.signals.EwmaChangePoint.Direction.STABLE);
        assertThat(trend.strength()).isEqualTo(0);
    }

    @Test
    void trend_ignoresUnparseableTimestamps() {
        var bad = new AIAdvisorRequest.PricePoint(1.7, "not-a-date");
        var good = buildLinearHistory(1.700, 0.005, 12);
        var combined = new ArrayList<>(good);
        combined.add(bad);
        var trend = LocalHeuristicFallback.analyseTrend(combined);

        // still detects rising despite the malformed entry
        assertThat(trend.direction()).isEqualTo(com.fuelyn.ai.signals.EwmaChangePoint.Direction.RISING);
    }

    // ────────────────────────────────────────────────────────────
    // Decision behaviour
    // ────────────────────────────────────────────────────────────

    @Test
    void risingTrend_drivesActionToBuyNow() {
        var prices = List.of(
                new AIAdvisorRequest.StationPrice("A", "Aral", 1.749, 1.0),
                new AIAdvisorRequest.StationPrice("B", "Shell", 1.789, 2.0),
                new AIAdvisorRequest.StationPrice("C", "JET",  1.799, 3.0),
                new AIAdvisorRequest.StationPrice("D", "Star", 1.819, 4.0)
        );
        var history = buildLinearHistory(1.700, 0.008, 24); // strongly rising

        AIAdvisorRequest req = new AIAdvisorRequest(prices, "e10", history, 52.5, 13.4, 50);
        AIAdvisorResponse r = LocalHeuristicFallback.analyze(req, TUE_EVENING);

        assertThat(r.action()).isEqualTo("buy_now");
        assertThat(r.priceOutlook()).contains("steigend");
    }

    @Test
    void fallingTrend_drivesActionToWait() {
        // Tight cluster (no buy via z-score), strongly falling trend, expensive day/hour.
        var prices = List.of(
                new AIAdvisorRequest.StationPrice("A", "Aral", 1.795, 1.0),
                new AIAdvisorRequest.StationPrice("B", "Shell", 1.799, 2.0),
                new AIAdvisorRequest.StationPrice("C", "JET",  1.801, 3.0),
                new AIAdvisorRequest.StationPrice("D", "Star", 1.803, 4.0)
        );
        var history = buildLinearHistory(1.900, -0.008, 24);

        AIAdvisorRequest req = new AIAdvisorRequest(prices, "e10", history, 52.5, 13.4, 50);
        AIAdvisorResponse r = LocalHeuristicFallback.analyze(req, FRI_MORNING);

        assertThat(r.action()).isEqualTo("wait");
        assertThat(r.priceOutlook()).contains("fallend");
    }

    @Test
    void tightSpread_isNotEnoughToBuyDespiteZScore() {
        // Cheapest is 1.5σ below mean but absolute spread is just 0.4 ct.
        // Without other buy signals, action must be "wait".
        var prices = List.of(
                new AIAdvisorRequest.StationPrice("A", "Aral", 1.795, 1.0),
                new AIAdvisorRequest.StationPrice("B", "Shell", 1.799, 2.0),
                new AIAdvisorRequest.StationPrice("C", "JET",  1.801, 3.0),
                new AIAdvisorRequest.StationPrice("D", "Star", 1.803, 4.0)
        );
        AIAdvisorRequest req = new AIAdvisorRequest(prices, "e10", null, null, null, 50);
        AIAdvisorResponse r = LocalHeuristicFallback.analyze(req, FRI_MORNING);

        assertThat(r.action()).isEqualTo("wait");
    }

    @Test
    void distancePenalty_surfacesInTipWhenDetourDoesNotPayOff() {
        // Cheapest by 1 ct but 15 km away → effective price loses to nearby station.
        var nearby = new AIAdvisorRequest.StationPrice("Nahe Shell", "Shell", 1.799, 0.5);
        var farCheap = new AIAdvisorRequest.StationPrice("Weite Aral", "Aral", 1.789, 15.0);

        AIAdvisorRequest req = new AIAdvisorRequest(
                List.of(nearby, farCheap), "e10", null, 52.5, 13.4, 50
        );
        AIAdvisorResponse r = LocalHeuristicFallback.analyze(req);

        // bestStation contract preserved: still the absolute cheapest
        assertThat(r.bestStation().name()).isEqualTo("Weite Aral");
        // ...but the tip should now flag the nearby option as the better effective deal
        assertThat(r.tip()).contains("Nahe Shell");
        assertThat(r.tip()).containsIgnoringCase("nominal teurer");
    }

    @Test
    void confidenceIsHigh_withManyStationsAndStrongSignal() {
        // 25 stations, one strong outlier that drives a large negative z-score.
        List<AIAdvisorRequest.StationPrice> prices = new ArrayList<>();
        prices.add(new AIAdvisorRequest.StationPrice("Outlier", "X", 1.500, 1.0));
        for (int i = 0; i < 24; i++) {
            prices.add(new AIAdvisorRequest.StationPrice("S" + i, "Y", 1.800 + i * 0.001, i));
        }

        AIAdvisorRequest req = new AIAdvisorRequest(prices, "e10", null, null, null, 50);
        AIAdvisorResponse r = LocalHeuristicFallback.analyze(req);

        assertThat(r.confidence()).isEqualTo("high");
    }

    @Test
    void wideSpreadGetsCaptured_inSavingsAndExplanation() {
        var prices = List.of(
                new AIAdvisorRequest.StationPrice("Cheap", "X", 1.600, 1.0),
                new AIAdvisorRequest.StationPrice("Mid",   "Y", 1.700, 1.0),
                new AIAdvisorRequest.StationPrice("High",  "Z", 1.800, 1.0)
        );
        AIAdvisorRequest req = new AIAdvisorRequest(prices, "e10", null, null, null, 60);
        AIAdvisorResponse r = LocalHeuristicFallback.analyze(req);

        // Spread 0.20 € × 60 L = 12.00 €
        assertThat(r.savingsEstimate()).isEqualTo(12.0);
        assertThat(r.bestStation().name()).isEqualTo("Cheap");
    }

    // ────────────────────────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────────────────────────

    /** Build a synthetic price history whose timestamps are in the last 24 h. */
    private static List<AIAdvisorRequest.PricePoint> buildLinearHistory(double start, double stepPerHour, int points) {
        List<AIAdvisorRequest.PricePoint> out = new ArrayList<>(points);
        Instant base = Instant.now().minusSeconds(3_600L * (points - 1));
        for (int i = 0; i < points; i++) {
            String ts = OffsetDateTime.ofInstant(base.plusSeconds(3_600L * i), ZoneOffset.UTC).toString();
            out.add(new AIAdvisorRequest.PricePoint(start + stepPerHour * i, ts));
        }
        return out;
    }

    private static String ts(int hoursAgo) {
        return OffsetDateTime.ofInstant(Instant.now().minusSeconds(3_600L * hoursAgo), ZoneOffset.UTC).toString();
    }
}
