package com.fuelyn.price.model.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** DTOs for OpenChargeMap API responses and our internal charging station model. */
public final class ChargingStationResponse {

    private ChargingStationResponse() {}

    /** Our normalized charging station model returned to clients. */
    public record ChargingStation(
            String id,
            String name,
            String operator,
            double lat,
            double lng,
            double dist,
            String address,
            String city,
            String postCode,
            List<Connection> connections,
            boolean isOperational,
            String usageCost,
            String accessType) {}

    public record Connection(String type, Double powerKW, int quantity) {}

    // --- Raw OpenChargeMap response records ---

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OCMResult(
            int ID,
            OCMOperator OperatorInfo,
            OCMAddress AddressInfo,
            List<OCMConnection> Connections,
            OCMStatus StatusType,
            String UsageCost,
            OCMUsageType UsageType) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OCMOperator(String Title) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OCMAddress(
            String Title,
            String AddressLine1,
            String Town,
            String Postcode,
            double Latitude,
            double Longitude,
            Double Distance) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OCMConnection(
            int ConnectionTypeID,
            OCMConnectionType ConnectionType,
            Double PowerKW,
            Integer Quantity) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OCMConnectionType(String Title) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OCMStatus(Boolean IsOperational) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record OCMUsageType(String Title) {}
}
