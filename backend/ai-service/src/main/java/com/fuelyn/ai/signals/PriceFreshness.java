package com.fuelyn.ai.signals;

import com.fuelyn.ai.model.AIAdvisorRequest;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;

/**
 * Price-freshness scoring.
 *
 * <p>Tankerkönig occasionally serves prices that are several hours
 * old (MTS-K hiccups, station-side lag). A 1.45 € price last updated
 * 6 h ago is much weaker evidence than a 1.45 € price refreshed
 * 5 minutes ago — and it's also more likely to be a stale outlier
 * the heuristic should down-weight.</p>
 *
 * <p>The model is a piecewise step function:</p>
 * <pre>
 *    age &lt;  5 min  → weight 1.00
 *    age &lt; 30 min  → weight 0.85
 *    age &lt;  2 h    → weight 0.65
 *    age &lt;  6 h    → weight 0.40
 *    age ≥  6 h    → weight 0.15  (stale — likely keep but barely)
 *    no timestamp  → weight 0.70  (assume mid-confidence)
 * </pre>
 */
public final class PriceFreshness {

    private PriceFreshness() {}

    public static double weightOf(AIAdvisorRequest.StationPrice price, Clock clock) {
        if (price == null || price.lastChangeIso() == null || price.lastChangeIso().isBlank()) {
            return 0.70;
        }
        Instant updatedAt = parseIso(price.lastChangeIso());
        if (updatedAt == null) return 0.70;

        long ageMinutes = Duration.between(updatedAt, clock.instant()).toMinutes();
        if (ageMinutes < 0)   return 1.00; // future timestamp — treat as fresh
        if (ageMinutes < 5)   return 1.00;
        if (ageMinutes < 30)  return 0.85;
        if (ageMinutes < 120) return 0.65;
        if (ageMinutes < 360) return 0.40;
        return 0.15;
    }

    private static Instant parseIso(String iso) {
        try {
            return OffsetDateTime.parse(iso).toInstant();
        } catch (DateTimeParseException ignored) {
            try {
                return Instant.parse(iso);
            } catch (DateTimeParseException ignored2) {
                return null;
            }
        }
    }
}
