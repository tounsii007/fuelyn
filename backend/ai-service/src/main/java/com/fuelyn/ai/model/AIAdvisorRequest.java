package com.fuelyn.ai.model;

import com.fasterxml.jackson.annotation.JsonInclude;
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
 *
 * <p>Optional fields: {@code vehicleProfile}, {@code destination}, and
 * {@code priceHistory} are all nullable so legacy clients continue to
 * work. When present, they sharpen the recommendation:
 * <ul>
 *   <li>{@code vehicleProfile} → exact drive-cost penalty instead of
 *       a flat €/km estimate, plus tank-urgency signal</li>
 *   <li>{@code destination} → score stations along the route, not by
 *       Luftlinie distance</li>
 *   <li>{@code priceHistory} → trend signal via EWMA + change-point</li>
 * </ul>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
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
        Integer fillUpLiters,

        // ─── Optional, sharpens the verdict when provided ───────
        @Valid VehicleProfile vehicleProfile,
        @Valid Destination    destination
) {

    /**
     * One station's current price. {@code lastChangeIso} is optional
     * — when present it lets the heuristic down-weight stale prices
     * (Tankerkönig sometimes serves 4 h-old data after MTS-K hiccups).
     */
    public record StationPrice(
            @NotBlank @Size(max = 200) String stationName,
            @Size(max = 100) String brand,
            @PositiveOrZero double price,
            @PositiveOrZero double distance,

            // Optional ISO-8601 timestamp of the last reported change.
            // Older than ~30 min → freshness penalty applied.
            @Size(max = 40) String lastChangeIso,

            // Optional — used when caller has per-station coordinates
            // (lets us compute route-detour penalties rather than
            // user-relative distance).
            @DecimalMin(value = "-90.0")  @DecimalMax(value = "90.0")  Double lat,
            @DecimalMin(value = "-180.0") @DecimalMax(value = "180.0") Double lng
    ) {
        // Compact canonical constructor — keep the legacy 4-arg ctor
        // working so existing callers and tests don't need to change.
        public StationPrice(String stationName, String brand, double price, double distance) {
            this(stationName, brand, price, distance, null, null, null);
        }
    }

    public record PricePoint(
            @PositiveOrZero double price,
            @NotBlank @Size(max = 40) String timestamp
    ) {}

    public record VehicleProfile(
            // L/100 km — typical 4–12 for ICE
            @DecimalMin("1.0") @DecimalMax("30.0") Double consumptionL100km,
            // Current fuel level as a fraction in [0,1]; used for tank-urgency
            @DecimalMin("0.0") @DecimalMax("1.0") Double fuelLevel,
            // Tank capacity in litres (optional — falls back to fillUpLiters)
            @DecimalMin("10.0") @DecimalMax("200.0") Double tankCapacityL
    ) {}

    public record Destination(
            @DecimalMin("-90.0")  @DecimalMax("90.0")  Double lat,
            @DecimalMin("-180.0") @DecimalMax("180.0") Double lng
    ) {}

    // Compact ctor with defaults — preserves legacy 6-arg / 7-arg calls.
    public AIAdvisorRequest(List<StationPrice> prices, String fuelType,
                            List<PricePoint> priceHistory, Double lat, Double lng,
                            Integer fillUpLiters) {
        this(prices, fuelType, priceHistory, lat, lng, fillUpLiters, null, null);
    }

    public AIAdvisorRequest {
        if (fillUpLiters == null) {
            fillUpLiters = 50;
        }
    }
}
