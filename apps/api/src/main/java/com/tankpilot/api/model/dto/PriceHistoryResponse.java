package com.tankpilot.api.model.dto;

import java.util.List;

public record PriceHistoryResponse(
        String stationId,
        String fuelType,
        List<PricePoint> history,
        PriceStats stats
) {
    public record PricePoint(double price, String timestamp) {
    }

    public record PriceStats(
            double min,
            double max,
            double avg,
            double trend,
            String cheapestDay,
            String expensiveDay
    ) {
    }
}
