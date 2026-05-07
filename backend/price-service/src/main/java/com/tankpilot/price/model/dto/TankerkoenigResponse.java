package com.tankpilot.price.model.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Map;

/**
 * DTOs for deserializing Tankerkoenig API JSON responses.
 */
public final class TankerkoenigResponse {

    private TankerkoenigResponse() {}

    /** Response from /json/list.php */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ListResponse(boolean ok, String message, List<Station> stations) {}

    /** Response from /json/detail.php */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record DetailResponse(boolean ok, String message, Station station) {}

    /** Response from /json/prices.php */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PricesResponse(boolean ok, Map<String, PriceEntry> prices) {}

    /** A single station from the list response. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Station(
            String id, String name, String brand,
            String street, String houseNumber, String postCode, String place,
            double lat, double lng, double dist,
            Double diesel, Double e5, Double e10,
            boolean isOpen
    ) {}

    /** A price entry from the batch price response. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PriceEntry(String status, Double e5, Double e10, Double diesel) {}
}
