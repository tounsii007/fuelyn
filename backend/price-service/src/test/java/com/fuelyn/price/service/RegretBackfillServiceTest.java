package com.fuelyn.price.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.offset;

/**
 * Unit tests for {@link RegretBackfillService#computeRegret}.
 *
 * <p>The full SQL path (lookups against {@code price_snapshots} +
 * {@code station_meta}) is covered by an integration test once
 * Testcontainers is wired up; these focus on the pure regret
 * formula because that's the part that drives policy.</p>
 */
class RegretBackfillServiceTest {

    @Test
    void zeroRegret_whenRecommendationWasCheapest() {
        // Recommended 1.749 €, market low 1.749 € → 0 regret
        Double r = RegretBackfillService.computeRegret(1.749, 1.749, 50.0);
        assertThat(r).isEqualTo(0.0);
    }

    @Test
    void clampsNegativeRegretToZero() {
        // We told the user to buy at 1.749 € and the cheapest in the
        // following 24 h was 1.799 € → user "won". We don't reward
        // ourselves with negative regret because that would muddle
        // the gradient when later tuning weights.
        Double r = RegretBackfillService.computeRegret(1.749, 1.799, 50.0);
        assertThat(r).isEqualTo(0.0);
    }

    @Test
    void positiveRegret_isPriceDeltaTimesLiters() {
        // Recommended 1.799 €, would-have-been 1.749 € → 0.05 € × 50 L = 2.50 €
        Double r = RegretBackfillService.computeRegret(1.799, 1.749, 50.0);
        assertThat(r).isCloseTo(2.50, offset(0.001));
    }

    @Test
    void rounds_toCents() {
        // Sub-cent precision in the inputs must not leak into the
        // stored regret value; we always cap at two decimals so the
        // downstream aggregation queries don't multiply float noise.
        // Verified by checking the result's hundredths-place equality
        // rather than picking a brittle exact value (Math.round vs.
        // IEEE-754 quirks at the *.5 cents boundary make a hard
        // equality fragile across JVM minor versions).
        Double r = RegretBackfillService.computeRegret(1.795, 1.7497, 50.0);
        assertThat(r).isNotNull();
        // ≤ 2 decimal places of precision
        assertThat(Math.round(r * 100.0) / 100.0).isEqualTo(r);
        // Matches the rough magnitude of (0.0453 € × 50 L) within ±1 cent
        assertThat(r).isBetween(2.25, 2.27);
    }

    @Test
    void nullInputs_yieldNullRegret() {
        // Missing recommendation OR realisation ⇒ we can't compute; the
        // backfill cron still stamps backfilled_at to avoid retrying
        // forever, but regret_eur stays NULL for offline filtering.
        assertThat(RegretBackfillService.computeRegret(null, 1.7, 50.0)).isNull();
        assertThat(RegretBackfillService.computeRegret(1.7, null, 50.0)).isNull();
    }

    @Test
    void missingLiters_fallsBackTo50() {
        // Most of the app sends fillUpLiters=50 when the user hasn't
        // configured a vehicle. Mirror that default so a NULL liters
        // column doesn't suppress regret entirely.
        Double r = RegretBackfillService.computeRegret(1.799, 1.749, null);
        assertThat(r).isCloseTo(2.50, offset(0.001));
    }

    @Test
    void zeroLiters_fallsBackTo50() {
        // Defensive: a 0 in the DB shouldn't zero-out regret silently.
        Double r = RegretBackfillService.computeRegret(1.799, 1.749, 0.0);
        assertThat(r).isCloseTo(2.50, offset(0.001));
    }
}
