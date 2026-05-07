package com.tankpilot.price.service;

import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.tankpilot.price.model.entity.PriceSnapshot;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.offset;

class PriceStatisticsTest {

    private static PriceSnapshot snap(String id, double price, LocalDateTime ts) {
        return new PriceSnapshot(id, "e10", price, ts);
    }

    @Test
    void emptyList_returnsZeroStats() {
        PriceStatistics.Stats stats = PriceStatistics.compute(List.of());
        assertThat(stats.min()).isZero();
        assertThat(stats.max()).isZero();
        assertThat(stats.avg()).isZero();
        assertThat(stats.trend()).isZero();
        assertThat(stats.trendLabel()).isEqualTo("stable");
        assertThat(stats.cheapestDay()).isEqualTo("N/A");
    }

    @Test
    void singleSnapshot_minEqualsMaxEqualsAvg() {
        PriceStatistics.Stats stats = PriceStatistics.compute(List.of(
                snap("s1", 1.799, LocalDateTime.of(2026, 1, 5, 12, 0))));
        assertThat(stats.min()).isEqualTo(1.799);
        assertThat(stats.max()).isEqualTo(1.799);
        assertThat(stats.avg()).isEqualTo(1.799);
    }

    @Test
    void computesMinMaxAvgCorrectly() {
        PriceStatistics.Stats stats = PriceStatistics.compute(List.of(
                snap("s1", 1.700, LocalDateTime.of(2026, 1, 1, 12, 0)),
                snap("s1", 1.750, LocalDateTime.of(2026, 1, 2, 12, 0)),
                snap("s1", 1.725, LocalDateTime.of(2026, 1, 3, 12, 0)),
                snap("s1", 1.680, LocalDateTime.of(2026, 1, 4, 12, 0))));

        assertThat(stats.min()).isEqualTo(1.680);
        assertThat(stats.max()).isEqualTo(1.750);
        assertThat(stats.avg()).isCloseTo(1.71375, offset(0.002));
    }

    @Test
    void trend_risingWhenLastWindowHigher() {
        PriceStatistics.Stats stats = PriceStatistics.compute(List.of(
                snap("s1", 1.500, LocalDateTime.of(2026, 1, 1, 0, 0)),
                snap("s1", 1.510, LocalDateTime.of(2026, 1, 2, 0, 0)),
                snap("s1", 1.520, LocalDateTime.of(2026, 1, 3, 0, 0)),
                snap("s1", 1.700, LocalDateTime.of(2026, 1, 4, 0, 0)),
                snap("s1", 1.710, LocalDateTime.of(2026, 1, 5, 0, 0)),
                snap("s1", 1.720, LocalDateTime.of(2026, 1, 6, 0, 0))));

        assertThat(stats.trend()).isPositive();
        assertThat(stats.trendLabel()).isEqualTo("rising");
    }

    @Test
    void trend_fallingWhenLastWindowLower() {
        PriceStatistics.Stats stats = PriceStatistics.compute(List.of(
                snap("s1", 1.800, LocalDateTime.of(2026, 1, 1, 0, 0)),
                snap("s1", 1.790, LocalDateTime.of(2026, 1, 2, 0, 0)),
                snap("s1", 1.780, LocalDateTime.of(2026, 1, 3, 0, 0)),
                snap("s1", 1.600, LocalDateTime.of(2026, 1, 4, 0, 0)),
                snap("s1", 1.590, LocalDateTime.of(2026, 1, 5, 0, 0)),
                snap("s1", 1.580, LocalDateTime.of(2026, 1, 6, 0, 0))));

        assertThat(stats.trendLabel()).isEqualTo("falling");
    }

    @Test
    void dayOfWeek_pickedAsCheapestExpensive() {
        // Monday (1.60) cheapest, Friday (1.79) most expensive
        PriceStatistics.Stats stats = PriceStatistics.compute(List.of(
                snap("s1", 1.60, LocalDateTime.of(2026, 1, 5, 12, 0)),  // Mon
                snap("s1", 1.79, LocalDateTime.of(2026, 1, 9, 12, 0)),  // Fri
                snap("s1", 1.70, LocalDateTime.of(2026, 1, 7, 12, 0))));// Wed

        assertThat(stats.cheapestDay()).isEqualTo("Montag");
        assertThat(stats.expensiveDay()).isEqualTo("Freitag");
        assertThat(stats.dayOfWeekAvg()).containsKeys("Montag", "Mittwoch", "Freitag");
    }

    @Test
    void boundingBox_hasReasonableSize() {
        // Berlin Mitte, 10 km radius
        PriceStatistics.BoundingBox bb = PriceStatistics.boundingBox(52.52, 13.40, 10);
        double latSpan = bb.maxLat() - bb.minLat();
        double lngSpan = bb.maxLng() - bb.minLng();
        // ~0.18 deg lat-span (10/111.32 * 2)
        assertThat(latSpan).isCloseTo(0.18, offset(0.01));
        // Longitude span at lat 52.52 is wider in degrees because cos(lat) < 1
        assertThat(lngSpan).isGreaterThan(latSpan);
    }

    @Test
    void stationAverages_sortedAscending() {
        var snapshots = List.of(
                snap("a", 1.80, LocalDateTime.of(2026, 1, 1, 12, 0)),
                snap("b", 1.60, LocalDateTime.of(2026, 1, 1, 12, 0)),
                snap("a", 1.78, LocalDateTime.of(2026, 1, 2, 12, 0)),
                snap("b", 1.62, LocalDateTime.of(2026, 1, 2, 12, 0)));

        var averages = PriceStatistics.stationAverages(snapshots);
        assertThat(averages).hasSize(2);
        assertThat(averages.get(0).stationId()).isEqualTo("b");
        assertThat(averages.get(0).avgPrice()).isCloseTo(1.61, offset(0.01));
        assertThat(averages.get(1).stationId()).isEqualTo("a");
    }
}
