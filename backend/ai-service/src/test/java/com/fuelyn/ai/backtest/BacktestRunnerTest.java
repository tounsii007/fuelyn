package com.fuelyn.ai.backtest;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Smoke test for the backtesting runner using a synthetic two-week
 * fixture. We don't assert the heuristic is "good" here — that's
 * what the report itself measures — only that the framework runs
 * end-to-end without throwing and returns sensible aggregate shapes.
 */
class BacktestRunnerTest {

    @Test
    void runsEndToEndOnSyntheticFixture() throws Exception {
        String fixture = buildSyntheticFixture(14);
        BacktestRunner.Report report = BacktestRunner.run(fixture.getBytes(StandardCharsets.UTF_8));

        assertThat(report.decisions()).isGreaterThan(50);
        assertThat(report.buyNow() + report.waitCount()).isEqualTo(report.decisions());
        assertThat(report.meanRegretCt()).isGreaterThanOrEqualTo(0);
        assertThat(report.winRateVsAlwaysBuyNow()).isBetween(0.0, 1.0);
    }

    /**
     * Build a fixture mimicking the German diurnal pattern: roughly
     * sinusoidal drop in the evening, slight rise overnight, +1 ct
     * trend across the period. Two stations with a small brand offset.
     */
    private static String buildSyntheticFixture(int days) {
        StringBuilder sb = new StringBuilder();
        sb.append("{ \"fuelType\": \"e10\", \"stations\": [");
        sb.append(buildStation("Aral", 1.799, 0.02));
        sb.append(",");
        sb.append(buildStation("Star", 1.749, -0.015));
        sb.append("] }");
        return sb.toString();
    }

    private static String buildStation(String brand, double base, double brandOffset) {
        StringBuilder sb = new StringBuilder();
        sb.append("{ \"name\": \"").append(brand).append(" Demo\", \"brand\": \"").append(brand)
                .append("\", \"distance\": 1.0, \"history\": [");
        Instant t0 = Instant.parse("2026-04-15T00:00:00Z");
        for (int hour = 0; hour < 14 * 24; hour++) {
            int hourOfDay = hour % 24;
            // Diurnal: drop 4 ct around 19:00, +2 ct around 8:00
            double diurnal =
                    (hourOfDay >= 18 && hourOfDay <= 20) ? -0.04 :
                    (hourOfDay >= 6 && hourOfDay <= 9)   ?  0.02 : 0.0;
            // 1 ct upward trend across the period
            double trend = 0.01 * (hour / (14.0 * 24.0));
            double price = base + brandOffset + diurnal + trend;
            String ts = OffsetDateTime.ofInstant(
                    t0.plus(Duration.ofHours(hour)), ZoneOffset.UTC).toString();
            if (hour > 0) sb.append(",");
            sb.append("{ \"ts\": \"").append(ts).append("\", \"price\": ")
                    .append(String.format(java.util.Locale.ROOT, "%.4f", price)).append("}");
        }
        sb.append("] }");
        return sb.toString();
    }
}
