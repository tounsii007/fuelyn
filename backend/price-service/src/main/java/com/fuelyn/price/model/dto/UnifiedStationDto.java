package com.fuelyn.price.model.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Wire DTO for the unified-stations endpoint. Combines fuel and EV charging stations into one shape
 * so the frontend can render them in a single list without branch-by-branch type checks beyond
 * reading {@link #stationType()}.
 *
 * <p>Replaces a pair of hand-built {@code Map<String, Object>} maps in {@code
 * UnifiedStationController} that had drifted apart (fuel had a top-level {@code price} that EV did
 * not, EV had {@code maxPowerKW} that fuel did not, etc.). With one record both branches must
 * produce the same shape — record component names become the JSON keys, so the existing wire
 * contract is preserved verbatim.
 *
 * <p>{@code @JsonInclude(NON_NULL)} keeps the response slim — fuel stations don't include {@code
 * connections}/{@code maxPowerKW} and EV stations don't include {@code prices}/{@code price}.
 * Frontend code must already handle these as optional today.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record UnifiedStationDto(
        String id,
        String name,
        String brand,
        Double lat,
        Double lng,
        Double dist,
        Boolean isOpen,
        String stationType,
        String source,
        AddressDto address,
        List<String> energyTypes,

        // Fuel-specific
        PricesDto prices,
        Double price,

        // EV-specific
        String operator,
        Boolean isOperational,
        List<ConnectionDto> connections,
        List<String> chargingTypes,
        Double maxPowerKW,
        Integer totalPoints,
        String usageCost,
        String accessType) {
    /**
     * Nested DTOs explicitly opt back into NON_NULL because Jackson's include-policy on the
     * enclosing class does NOT propagate to record components. Without this annotation, a fuel
     * station with only diesel data emits {@code "prices":{"diesel":1.799,"e5":null,"e10":null}} —
     * bloating the wire and forcing every frontend consumer to defensively filter null prices.
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record AddressDto(String street, String houseNumber, String postCode, String city) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record PricesDto(Double diesel, Double e5, Double e10) {}

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record ConnectionDto(
            String connectorType,
            String connectorLabel,
            Double powerKW,
            Integer quantity,
            String chargingSpeed) {}
}
