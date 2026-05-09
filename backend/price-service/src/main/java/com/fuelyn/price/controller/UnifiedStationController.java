package com.fuelyn.price.controller;

import com.fuelyn.common.dto.ApiResponse;
import com.fuelyn.price.model.dto.ChargingStationResponse.ChargingStation;
import com.fuelyn.price.model.dto.TankerkoenigResponse;
import com.fuelyn.price.model.dto.UnifiedStationDto;
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
import java.util.Comparator;
import java.util.LinkedHashSet;
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

        List<CompletableFuture<List<UnifiedStationDto>>> futures = new ArrayList<>();

        if (needsFuel) {
            String fuelType = pickFuelType(energyTypes);
            futures.add(CompletableFuture.supplyAsync(() -> {
                try {
                    List<TankerkoenigResponse.Station> stations =
                            tankerkoenigClient.searchStations(lat, lng, Math.min(rad, 25));
                    return stations.stream().map(s -> mapFuelStation(s, fuelType)).toList();
                } catch (Exception e) {
                    log.error("Fuel station fetch failed: {}", e.getMessage());
                    return Collections.<UnifiedStationDto>emptyList();
                }
            }));
        }

        if (needsCharging) {
            futures.add(CompletableFuture.supplyAsync(() -> {
                try {
                    List<ChargingStation> stations =
                            chargeMapClient.searchChargingStations(lat, lng, Math.min(rad, 50));
                    return stations.stream().map(this::mapChargingStation).toList();
                } catch (Exception e) {
                    log.error("Charging station fetch failed: {}", e.getMessage());
                    return Collections.<UnifiedStationDto>emptyList();
                }
            }));
        }

        // Each lambda already catches its own Exception and returns empty;
        // the previous outer try/catch around future.join() was unreachable.
        // Use allOf so we wait once for the slowest leg, then collect — the
        // explicit ordering also makes it obvious neither leg can fail
        // CompletableFuture-internally because both have boundaries inside.
        CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();
        List<UnifiedStationDto> allStations = new ArrayList<>();
        for (CompletableFuture<List<UnifiedStationDto>> future : futures) {
            allStations.addAll(future.join()); // already complete, returns immediately
        }

        if ("dist".equals(sort)) {
            allStations.sort(Comparator.comparingDouble(
                    s -> s.dist() != null ? s.dist() : 999.0));
        }

        return ResponseEntity.ok(ApiResponse.success(Map.of("stations", allStations)));
    }

    private String pickFuelType(List<String> energyTypes) {
        if (energyTypes.contains("diesel")) return "diesel";
        if (energyTypes.contains("e5")) return "e5";
        return "e10";
    }

    private UnifiedStationDto mapFuelStation(TankerkoenigResponse.Station s, String fuelType) {
        List<String> available = new ArrayList<>(3);
        if (s.diesel() != null) available.add("diesel");
        if (s.e5() != null) available.add("e5");
        if (s.e10() != null) available.add("e10");

        Double price = switch (fuelType) {
            case "diesel" -> s.diesel();
            case "e5" -> s.e5();
            default -> s.e10();
        };

        return new UnifiedStationDto(
                s.id(),
                s.name(),
                s.brand() != null ? s.brand() : "",
                s.lat(),
                s.lng(),
                s.dist(),
                s.isOpen(),
                "fuel",
                "tankerkoenig",
                new UnifiedStationDto.AddressDto(
                        s.street() != null ? s.street() : "",
                        s.houseNumber() != null ? s.houseNumber() : "",
                        s.postCode() != null ? s.postCode() : "",
                        s.place() != null ? s.place() : ""
                ),
                available,
                new UnifiedStationDto.PricesDto(s.diesel(), s.e5(), s.e10()),
                price,
                // EV-only fields below
                null, null, null, null, null, null, null, null
        );
    }

    private UnifiedStationDto mapChargingStation(ChargingStation s) {
        double maxPower = 0;
        int totalPoints = 0;
        Set<String> chargingSpeeds = new LinkedHashSet<>();
        List<UnifiedStationDto.ConnectionDto> mappedConnections = new ArrayList<>();

        if (s.connections() != null) {
            for (var conn : s.connections()) {
                String speed = "ac";
                if (conn.powerKW() != null) {
                    if (conn.powerKW() >= 150) speed = "hpc";
                    else if (conn.powerKW() >= 22) speed = "dc";
                    if (conn.powerKW() > maxPower) maxPower = conn.powerKW();
                }
                chargingSpeeds.add(speed);
                totalPoints += conn.quantity();
                mappedConnections.add(new UnifiedStationDto.ConnectionDto(
                        conn.type() != null ? conn.type() : "unknown",
                        conn.type() != null ? conn.type() : "Unbekannt",
                        conn.powerKW(),
                        conn.quantity(),
                        speed
                ));
            }
        }

        List<String> energyTypes = new ArrayList<>(chargingSpeeds.size());
        for (String speed : chargingSpeeds) {
            switch (speed) {
                case "ac" -> energyTypes.add("ev_ac");
                case "dc" -> energyTypes.add("ev_dc");
                case "hpc" -> energyTypes.add("ev_hpc");
            }
        }
        if (energyTypes.isEmpty()) energyTypes.add("ev_ac");

        String operator = s.operator() != null ? s.operator() : "";

        return new UnifiedStationDto(
                "ev-" + s.id(),
                s.name(),
                operator,
                s.lat(),
                s.lng(),
                s.dist(),
                s.isOperational(),
                "charging",
                "openchargemap",
                new UnifiedStationDto.AddressDto(
                        s.address() != null ? s.address() : "",
                        "",
                        s.postCode() != null ? s.postCode() : "",
                        s.city() != null ? s.city() : ""
                ),
                energyTypes,
                // Fuel-only fields
                null, null,
                operator,
                s.isOperational(),
                mappedConnections,
                new ArrayList<>(chargingSpeeds),
                maxPower > 0 ? maxPower : null,
                totalPoints,
                s.usageCost(),
                s.accessType()
        );
    }
}
