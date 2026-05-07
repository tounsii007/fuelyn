package com.fuelyn.price.controller;

import com.fuelyn.common.dto.ApiResponse;
import com.fuelyn.price.model.dto.ChargingStationResponse.ChargingStation;
import com.fuelyn.price.model.dto.TankerkoenigResponse;
import com.fuelyn.price.service.OpenChargeMapClient;
import com.fuelyn.price.service.TankerkoenigClient;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

/**
 * Unified station endpoint — queries Tankerkoenig + OpenChargeMap in parallel,
 * returns combined results as a flat list.
 *
 * <p>Supported energy types: diesel, e5, e10, ev_ac, ev_dc, ev_hpc, h2, lpg, cng, lng</p>
 */
@RestController
@RequestMapping("/api/v1/prices")
@Validated
public class UnifiedStationController {

    private static final Logger log = LoggerFactory.getLogger(UnifiedStationController.class);

    private static final Set<String> FUEL_TYPES = Set.of("diesel", "e5", "e10", "super_plus");
    private static final Set<String> EV_TYPES = Set.of("ev_ac", "ev_dc", "ev_hpc");
    private static final Set<String> ALL_VALID = Set.of(
            "diesel", "e5", "e10", "super_plus", "lpg", "cng", "lng", "h2",
            "ev_ac", "ev_dc", "ev_hpc"
    );

    private final TankerkoenigClient tankerkoenigClient;
    private final OpenChargeMapClient chargeMapClient;

    public UnifiedStationController(TankerkoenigClient tankerkoenigClient,
                                     OpenChargeMapClient chargeMapClient) {
        this.tankerkoenigClient = tankerkoenigClient;
        this.chargeMapClient = chargeMapClient;
    }

    /**
     * GET /api/v1/prices/unified?lat=...&lng=...&rad=10&types=diesel,e10,ev_ac&sort=dist
     */
    @GetMapping("/unified")
    public ResponseEntity<ApiResponse<Map<String, Object>>> unified(
            @RequestParam @Min(-90) @Max(90) double lat,
            @RequestParam @Min(-180) @Max(180) double lng,
            @RequestParam(defaultValue = "10") @Min(1) @Max(50) double rad,
            @RequestParam(defaultValue = "diesel,e5,e10")
                @Size(max = 120)
                @Pattern(regexp = "[a-z_0-9,\\s]+", message = "types must be a comma-separated list of energy types") String types,
            @RequestParam(defaultValue = "dist")
                @Pattern(regexp = "dist|price") String sort
    ) {
        List<String> energyTypes = Arrays.stream(types.split(","))
                .map(String::trim)
                .filter(ALL_VALID::contains)
                .toList();

        if (energyTypes.isEmpty()) {
            energyTypes = List.of("diesel", "e5", "e10");
        }

        log.info("Unified search: lat={}, lng={}, rad={}, types={}", lat, lng, rad, energyTypes);

        boolean needsFuel = energyTypes.stream().anyMatch(FUEL_TYPES::contains);
        boolean needsCharging = energyTypes.stream().anyMatch(EV_TYPES::contains);

        List<CompletableFuture<List<Map<String, Object>>>> futures = new ArrayList<>();

        // Fuel stations
        if (needsFuel) {
            String fuelType = pickFuelType(energyTypes);
            futures.add(CompletableFuture.supplyAsync(() -> {
                try {
                    List<TankerkoenigResponse.Station> stations =
                            tankerkoenigClient.searchStations(lat, lng, Math.min(rad, 25));
                    return stations.stream().map(s -> mapFuelStation(s, fuelType)).toList();
                } catch (Exception e) {
                    log.error("Fuel station fetch failed: {}", e.getMessage());
                    return Collections.emptyList();
                }
            }));
        }

        // EV charging stations
        if (needsCharging) {
            futures.add(CompletableFuture.supplyAsync(() -> {
                try {
                    List<ChargingStation> stations =
                            chargeMapClient.searchChargingStations(lat, lng, Math.min(rad, 50));
                    return stations.stream().map(this::mapChargingStation).toList();
                } catch (Exception e) {
                    log.error("Charging station fetch failed: {}", e.getMessage());
                    return Collections.emptyList();
                }
            }));
        }

        // Collect all results
        List<Map<String, Object>> allStations = new ArrayList<>();
        for (CompletableFuture<List<Map<String, Object>>> future : futures) {
            try {
                allStations.addAll(future.join());
            } catch (Exception e) {
                log.error("Station fetch failed: {}", e.getMessage());
            }
        }

        // Sort
        if ("dist".equals(sort)) {
            allStations.sort((a, b) -> Double.compare(
                    ((Number) a.getOrDefault("dist", 999.0)).doubleValue(),
                    ((Number) b.getOrDefault("dist", 999.0)).doubleValue()
            ));
        }

        return ResponseEntity.ok(ApiResponse.success(Map.of("stations", allStations)));
    }

    private String pickFuelType(List<String> energyTypes) {
        if (energyTypes.contains("diesel")) return "diesel";
        if (energyTypes.contains("e5")) return "e5";
        return "e10";
    }

    private Map<String, Object> mapFuelStation(TankerkoenigResponse.Station s, String fuelType) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", s.id());
        map.put("name", s.name());
        map.put("brand", s.brand() != null ? s.brand() : "");
        map.put("lat", s.lat());
        map.put("lng", s.lng());
        map.put("dist", s.dist());
        map.put("isOpen", s.isOpen());
        map.put("stationType", "fuel");
        map.put("source", "tankerkoenig");

        // Nested address object matching frontend StationAddress type
        Map<String, Object> address = new HashMap<>();
        address.put("street", s.street() != null ? s.street() : "");
        address.put("houseNumber", s.houseNumber() != null ? s.houseNumber() : "");
        address.put("postCode", s.postCode() != null ? s.postCode() : "");
        address.put("city", s.place() != null ? s.place() : "");
        map.put("address", address);

        // Nested prices object matching frontend StationPrices type
        Map<String, Object> prices = new HashMap<>();
        prices.put("diesel", s.diesel());
        prices.put("e5", s.e5());
        prices.put("e10", s.e10());
        map.put("prices", prices);

        // Energy types array
        List<String> energyTypes = new ArrayList<>();
        if (s.diesel() != null) energyTypes.add("diesel");
        if (s.e5() != null) energyTypes.add("e5");
        if (s.e10() != null) energyTypes.add("e10");
        map.put("energyTypes", energyTypes);

        // Convenience price field for sorting
        Double price = switch (fuelType) {
            case "diesel" -> s.diesel();
            case "e5" -> s.e5();
            default -> s.e10();
        };
        map.put("price", price);

        return map;
    }

    private Map<String, Object> mapChargingStation(ChargingStation s) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", "ev-" + s.id());
        map.put("name", s.name());
        map.put("brand", s.operator() != null ? s.operator() : "");
        map.put("operator", s.operator() != null ? s.operator() : "");
        map.put("lat", s.lat());
        map.put("lng", s.lng());
        map.put("dist", s.dist());
        map.put("isOpen", s.isOperational());
        map.put("isOperational", s.isOperational());
        map.put("stationType", "charging");
        map.put("source", "openchargemap");

        // Nested address object
        Map<String, Object> address = new HashMap<>();
        address.put("street", s.address() != null ? s.address() : "");
        address.put("houseNumber", "");
        address.put("postCode", s.postCode() != null ? s.postCode() : "");
        address.put("city", s.city() != null ? s.city() : "");
        map.put("address", address);

        // Map connections to frontend UnifiedChargingConnection format
        double maxPower = 0;
        int totalPoints = 0;
        Set<String> chargingTypes = new java.util.LinkedHashSet<>();
        List<Map<String, Object>> mappedConnections = new ArrayList<>();

        if (s.connections() != null) {
            for (var conn : s.connections()) {
                Map<String, Object> c = new HashMap<>();
                c.put("connectorType", conn.type() != null ? conn.type() : "unknown");
                c.put("connectorLabel", conn.type() != null ? conn.type() : "Unbekannt");
                c.put("powerKW", conn.powerKW());
                c.put("quantity", conn.quantity());

                String speed = "ac";
                if (conn.powerKW() != null) {
                    if (conn.powerKW() >= 150) speed = "hpc";
                    else if (conn.powerKW() >= 22) speed = "dc";
                    if (conn.powerKW() > maxPower) maxPower = conn.powerKW();
                }
                c.put("chargingSpeed", speed);
                chargingTypes.add(speed);
                totalPoints += conn.quantity();
                mappedConnections.add(c);
            }
        }

        map.put("connections", mappedConnections);
        map.put("chargingTypes", new ArrayList<>(chargingTypes));
        map.put("maxPowerKW", maxPower > 0 ? maxPower : null);
        map.put("totalPoints", totalPoints);
        map.put("usageCost", s.usageCost());
        map.put("accessType", s.accessType());

        // Energy types
        List<String> energyTypes = new ArrayList<>();
        for (String ct : chargingTypes) {
            switch (ct) {
                case "ac" -> energyTypes.add("ev_ac");
                case "dc" -> energyTypes.add("ev_dc");
                case "hpc" -> energyTypes.add("ev_hpc");
            }
        }
        if (energyTypes.isEmpty()) energyTypes.add("ev_ac");
        map.put("energyTypes", energyTypes);

        return map;
    }
}
