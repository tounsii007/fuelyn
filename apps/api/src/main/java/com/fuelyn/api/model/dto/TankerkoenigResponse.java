package com.fuelyn.api.model.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public record TankerkoenigResponse(
        boolean ok,
        List<TankerkoenigStation> stations,
        Map<String, TankerkoenigPrices> prices,
        String message
) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TankerkoenigStation(
            String id,
            String name,
            String brand,
            String street,
            String houseNumber,
            String postCode,
            String place,
            Double lat,
            Double lng,
            Double dist,
            Double diesel,
            Double e5,
            Double e10,
            Boolean isOpen
    ) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record TankerkoenigPrices(
            String status,
            Double diesel,
            Double e5,
            Double e10
    ) {
    }
}
