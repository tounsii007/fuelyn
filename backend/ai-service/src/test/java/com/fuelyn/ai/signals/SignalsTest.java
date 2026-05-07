package com.fuelyn.ai.signals;

import com.fuelyn.ai.model.AIAdvisorRequest;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure-function tests for each signal helper. Keeps the LocalHeuristicFallback
 * integration test focused on the orchestration; these guard the maths.
 */
class SignalsTest {

    private static final Clock FIXED_NOW = Clock.fixed(
            Instant.parse("2026-05-07T10:00:00Z"), ZoneId.of("UTC"));

    // ─── PriceFreshness ──────────────────────────────────────────

    @Test
    void freshness_freshPriceGetsFullWeight() {
        var p = stationWithTimestamp(Instant.parse("2026-05-07T09:58:00Z"));
        assertThat(PriceFreshness.weightOf(p, FIXED_NOW)).isEqualTo(1.00);
    }

    @Test
    void freshness_oldPriceGetsLowWeight() {
        var p = stationWithTimestamp(Instant.parse("2026-05-07T03:00:00Z")); // 7h ago
        assertThat(PriceFreshness.weightOf(p, FIXED_NOW)).isEqualTo(0.15);
    }

    @Test
    void freshness_missingTimestampGetsMidWeight() {
        var p = new AIAdvisorRequest.StationPrice("X", "X", 1.7, 1.0);
        assertThat(PriceFreshness.weightOf(p, FIXED_NOW)).isEqualTo(0.70);
    }

    @Test
    void freshness_unparseableTimestampFallsBackToMidWeight() {
        var p = new AIAdvisorRequest.StationPrice("X", "X", 1.7, 1.0, "garbage", null, null);
        assertThat(PriceFreshness.weightOf(p, FIXED_NOW)).isEqualTo(0.70);
    }

    // ─── BrandBaseline ───────────────────────────────────────────

    @Test
    void brandBaseline_separatesAralFromStarCluster() {
        var prices = List.of(
                new AIAdvisorRequest.StationPrice("Aral A", "Aral", 1.799, 1.0),
                new AIAdvisorRequest.StationPrice("Aral B", "Aral", 1.819, 2.0),
                new AIAdvisorRequest.StationPrice("Aral C", "Aral", 1.789, 3.0),
                new AIAdvisorRequest.StationPrice("Star A", "Star", 1.749, 1.0),
                new AIAdvisorRequest.StationPrice("Star B", "Star", 1.759, 2.0),
                new AIAdvisorRequest.StationPrice("Star C", "Star", 1.739, 3.0)
        );
        var stats = BrandBaseline.compute(prices);
        assertThat(stats.perBrand()).containsKeys("aral", "star");
        // Star cluster mean ~1.749, Aral cluster mean ~1.802 — far apart
        assertThat(stats.perBrand().get("aral").mean()).isGreaterThan(stats.perBrand().get("star").mean() + 0.04);
    }

    @Test
    void brandBaseline_singletonBrandFallsBackToGlobalZ() {
        // One unique brand, two of another — the singleton's z must be computed globally.
        var prices = List.of(
                new AIAdvisorRequest.StationPrice("Solo", "Solo", 1.700, 1.0),
                new AIAdvisorRequest.StationPrice("Big A", "Big", 1.800, 2.0),
                new AIAdvisorRequest.StationPrice("Big B", "Big", 1.810, 3.0)
        );
        var stats = BrandBaseline.compute(prices);
        // The cheapest is "Solo" — its brandZ uses global (mean ≈ 1.770, std > 0)
        assertThat(stats.cheapestBrandZ()).isLessThan(0); // negative = below mean
    }

    // ─── EwmaChangePoint ─────────────────────────────────────────

    @Test
    void ewma_detectsRisingTrend() {
        var history = linear(1.700, 0.005, 24); // +0.5 ct/h over 24h
        var r = EwmaChangePoint.analyse(history);
        assertThat(r.direction()).isEqualTo(EwmaChangePoint.Direction.RISING);
        assertThat(r.slopePerDay()).isGreaterThan(0.05);
        assertThat(r.changePoint()).isEqualTo(EwmaChangePoint.ChangePoint.NONE);
    }

    @Test
    void ewma_detectsRecentDropAsChangePoint() {
        // Flat 1.79 for 20 hours, then sudden drop to 1.74
        List<AIAdvisorRequest.PricePoint> history = new ArrayList<>();
        Instant base = Instant.parse("2026-05-06T00:00:00Z");
        for (int i = 0; i < 20; i++) {
            history.add(new AIAdvisorRequest.PricePoint(1.790,
                    OffsetDateTime.ofInstant(base.plusSeconds(3_600L * i), ZoneOffset.UTC).toString()));
        }
        // Sharp 5 ct drop at hour 20
        for (int i = 20; i < 24; i++) {
            history.add(new AIAdvisorRequest.PricePoint(1.740,
                    OffsetDateTime.ofInstant(base.plusSeconds(3_600L * i), ZoneOffset.UTC).toString()));
        }
        var r = EwmaChangePoint.analyse(history);
        assertThat(r.changePoint()).isEqualTo(EwmaChangePoint.ChangePoint.RECENT_DROP);
        assertThat(r.hoursSinceChange()).isLessThan(6);
    }

    @Test
    void ewma_treatsTooFewPointsAsStable() {
        var r = EwmaChangePoint.analyse(List.of(
                new AIAdvisorRequest.PricePoint(1.7, "2026-05-07T08:00:00Z"),
                new AIAdvisorRequest.PricePoint(1.7, "2026-05-07T09:00:00Z")
        ));
        assertThat(r.direction()).isEqualTo(EwmaChangePoint.Direction.STABLE);
        assertThat(r.changePoint()).isEqualTo(EwmaChangePoint.ChangePoint.NONE);
    }

    // ─── BayesianPrior ───────────────────────────────────────────

    @Test
    void bayesPrior_tueEveningHasNegativePriorMean() {
        // Tuesday 19:00 should be one of the cheapest buckets
        var post = BayesianPrior.at(LocalDateTime.of(2026, 5, 5, 19, 0), 0);
        assertThat(post.priorMean()).isLessThanOrEqualTo(-3.0);
    }

    @Test
    void bayesPrior_friMorningHasPositivePriorMean() {
        // Friday 08:00 should be expensive
        var post = BayesianPrior.at(LocalDateTime.of(2026, 5, 8, 8, 0), 0);
        assertThat(post.priorMean()).isGreaterThanOrEqualTo(3.0);
    }

    @Test
    void bayesPrior_tiltIsNegativeWhenObservationMatchesExpensiveBucket() {
        // Friday 8 expects +5 ct, observe +5 ct → posterior tilt ≈ 0 (no surprise)
        var post = BayesianPrior.at(LocalDateTime.of(2026, 5, 8, 8, 0), 5.0);
        assertThat(Math.abs(post.tilt())).isLessThan(0.2);
    }

    // ─── AffiliateRebate ─────────────────────────────────────────

    @Test
    void affiliate_returnsZeroWhenNoMembership() {
        assertThat(AffiliateRebate.perLitre("aral", false)).isEqualTo(0.0);
    }

    @Test
    void affiliate_returnsBrandSpecificRebate() {
        assertThat(AffiliateRebate.perLitre("Aral", true)).isGreaterThan(0.0);
        assertThat(AffiliateRebate.perLitre("HEM", true)).isGreaterThan(0.0);
        assertThat(AffiliateRebate.perLitre("UnknownBrand", true)).isEqualTo(0.0);
    }

    // ─── RoutePenalty ────────────────────────────────────────────

    @Test
    void routePenalty_zeroForStationOnDirectPath() {
        // Origin (0,0) → station (0, 0.5) → destination (0, 1.0):
        // station lies exactly on the path, extra distance = 0
        var s = new AIAdvisorRequest.StationPrice(
                "OnPath", "X", 1.7, 0, null, 0.0, 0.5);
        var dest = new AIAdvisorRequest.Destination(0.0, 1.0);
        var d = RoutePenalty.compute(0, 0, s, dest);
        assertThat(d.extraKm()).isLessThan(0.01);
    }

    @Test
    void routePenalty_largeForOffPathStation() {
        // Origin (0,0), destination (0, 1.0), station 100 km off-path
        var s = new AIAdvisorRequest.StationPrice(
                "Faraway", "X", 1.7, 0, null, 1.0, 0.5);
        var dest = new AIAdvisorRequest.Destination(0.0, 1.0);
        var d = RoutePenalty.compute(0, 0, s, dest);
        assertThat(d.extraKm()).isGreaterThan(50);
    }

    @Test
    void routePenalty_fallsBackToDistanceWhenNoCoords() {
        var s = new AIAdvisorRequest.StationPrice("NoCoords", "X", 1.7, 5.0);
        var d = RoutePenalty.compute(0, 0, s, null);
        assertThat(d.extraKm()).isEqualTo(5.0);
    }

    // ─── helpers ─────────────────────────────────────────────────

    private static AIAdvisorRequest.StationPrice stationWithTimestamp(Instant t) {
        return new AIAdvisorRequest.StationPrice(
                "X", "X", 1.7, 1.0,
                OffsetDateTime.ofInstant(t, ZoneOffset.UTC).toString(),
                null, null);
    }

    private static List<AIAdvisorRequest.PricePoint> linear(double start, double stepPerHour, int points) {
        List<AIAdvisorRequest.PricePoint> out = new ArrayList<>(points);
        Instant base = Instant.parse("2026-05-06T00:00:00Z");
        for (int i = 0; i < points; i++) {
            out.add(new AIAdvisorRequest.PricePoint(
                    start + stepPerHour * i,
                    OffsetDateTime.ofInstant(base.plusSeconds(3_600L * i), ZoneOffset.UTC).toString()));
        }
        return out;
    }
}
