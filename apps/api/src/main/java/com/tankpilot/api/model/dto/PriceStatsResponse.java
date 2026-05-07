package com.tankpilot.api.model.dto;

import java.util.List;
import java.util.Map;

public record PriceStatsResponse(
        String fuelType,
        int days,
        double overallAvg,
        double overallMin,
        double overallMax,
        List<StationStats> stationStats,
        Map<String, Double> dayOfWeekAverages,
        String cheapestDay,
        String expensiveDay,
        double trend
) {
    public record StationStats(
            String stationId,
            double avgPrice,
            double minPrice,
            double maxPrice
    ) {
    }
}
