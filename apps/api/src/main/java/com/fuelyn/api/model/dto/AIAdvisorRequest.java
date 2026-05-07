package com.fuelyn.api.model.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record AIAdvisorRequest(
        @NotEmpty List<StationPrice> prices,
        @NotNull String fuelType,
        List<PricePoint> priceHistory,
        Double lat,
        Double lng,
        @Min(10) @Max(80) Integer fillUpLiters
) {
    public record StationPrice(String stationName, String brand, double price, double distance) {
    }

    public record PricePoint(double price, String timestamp) {
    }

    public AIAdvisorRequest {
        if (fillUpLiters == null) fillUpLiters = 50;
    }
}
