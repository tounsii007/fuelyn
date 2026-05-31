package com.fuelyn.common.events;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Real-time delta event for a single (station × fuelType) price change.
 *
 * <p>Producers publish this only when the price <i>actually changes</i> relative to the most recent
 * persisted snapshot — repeating the same value would create useless wakeups for every consumer
 * downstream.
 *
 * <p>The Kafka message <b>key</b> is {@link #stationId} so all events for one station land on the
 * same partition and stay strictly ordered. Per-station ordering matters: a consumer must be able
 * to assume that "previousPrice = X" came from the prior event for the same station.
 *
 * <h3>Topic</h3>
 *
 * <p>Default {@code fuelyn.prices.v1} (override per env).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PriceUpdatedEvent(
        String stationId,
        /** Free-form station name (snapshot at event time). */
        String stationName,
        /** Brand string, lowercased by producer for stable consumer keys. */
        String brand,
        /** Fuel type: "diesel" | "e5" | "e10". */
        String fuelType,
        /** New price in EUR/L. */
        double newPrice,
        /** Previous persisted price (nullable for first-ever observation). */
        Double previousPrice,
        /** newPrice - previousPrice, or null if no previous. */
        Double deltaPrice,
        /** Server-side observation timestamp (collection time). */
        Instant observedAt,
        /** Station coordinates (so consumers don't need a separate lookup). */
        Double lat,
        Double lng,
        /** Postal code, useful for geo-fence + analytics dashboards. */
        String postCode) {
    public static final String TYPE = "fuelyn.price.updated.v1";

    /** Compact factory for the typical "we already know previous" case. */
    public static PriceUpdatedEvent forUpdate(
            String stationId,
            String stationName,
            String brand,
            String fuelType,
            double newPrice,
            Double previousPrice,
            Instant observedAt,
            Double lat,
            Double lng,
            String postCode) {
        Double delta = previousPrice == null ? null : newPrice - previousPrice;
        return new PriceUpdatedEvent(
                stationId,
                stationName,
                brand,
                fuelType,
                newPrice,
                previousPrice,
                delta,
                observedAt,
                lat,
                lng,
                postCode);
    }
}
