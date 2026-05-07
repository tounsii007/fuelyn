package com.tankpilot.ai.model;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Request DTO for the AI fuel advisor endpoint.
 */
public record AIAdvisorRequest(
        @NotEmpty(message = "At least one station price is required")
        @Size(max = 50, message = "Maximum 50 stations per request")
        @Valid
        List<StationPrice> prices,

        @NotBlank @Pattern(regexp = "diesel|e5|e10", message = "fuelType must be diesel, e5, or e10")
        String fuelType,

        @Size(max = 500, message = "priceHistory is limited to 500 points")
        @Valid
        List<PricePoint> priceHistory,

        @DecimalMin(value = "-90.0")  @DecimalMax(value = "90.0")  Double lat,
        @DecimalMin(value = "-180.0") @DecimalMax(value = "180.0") Double lng,

        @Min(value = 10, message = "fillUpLiters must be at least 10")
        @Max(value = 200, message = "fillUpLiters must be at most 200")
        Integer fillUpLiters
) {
    public record StationPrice(
            @NotBlank @Size(max = 200) String stationName,
            @Size(max = 100) String brand,
            @PositiveOrZero double price,
            @PositiveOrZero double distance
    ) {}

    public record PricePoint(
            @PositiveOrZero double price,
            @NotBlank @Size(max = 40) String timestamp
    ) {}

    public AIAdvisorRequest {
        if (fillUpLiters == null) {
            fillUpLiters = 50;
        }
    }
}
