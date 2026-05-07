package com.fuelyn.price.model.dto;

import java.util.List;
import java.util.Map;

/**
 * Response DTO for price history queries.
 *
 * @param stationId  the station ID
 * @param fuelType   fuel type (diesel, e5, e10)
 * @param history    chronological price data points
 * @param stats      computed statistics
 */
public record PriceHistoryResponse(
        String stationId,
        String fuelType,
        List<PricePoint> history,
        PriceStats stats
) {
    /** A single price data point. */
    public record PricePoint(double price, String timestamp) {}

    /** Aggregated statistics over the history period. */
    public record PriceStats(
            double min, double max, double avg, double trend,
            String cheapestDay, String expensiveDay,
            Map<String, Double> dayOfWeekAvg
    ) {}
}
