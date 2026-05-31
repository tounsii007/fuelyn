package com.fuelyn.price.controller;

import java.util.List;
import java.util.Map;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fuelyn.common.dto.ApiResponse;
import com.fuelyn.price.model.dto.ChargingStationResponse.ChargingStation;
import com.fuelyn.price.service.OpenChargeMapClient;

/** Proxy endpoint for OpenChargeMap — EV charging station search. */
@RestController
@RequestMapping("/api/v1/prices")
@Validated
public class ChargingController {

    private static final Logger log = LoggerFactory.getLogger(ChargingController.class);

    private final OpenChargeMapClient chargeMapClient;

    public ChargingController(OpenChargeMapClient chargeMapClient) {
        this.chargeMapClient = chargeMapClient;
    }

    /** GET /api/v1/prices/charging?lat=...&lng=...&rad=10 */
    @GetMapping("/charging")
    public ResponseEntity<ApiResponse<Map<String, Object>>> searchCharging(
            @RequestParam @Min(-90) @Max(90) double lat,
            @RequestParam @Min(-180) @Max(180) double lng,
            @RequestParam(defaultValue = "10") @Min(1) @Max(100) double rad) {
        log.info("Charging station search: lat={}, lng={}, rad={}", lat, lng, rad);

        List<ChargingStation> stations = chargeMapClient.searchChargingStations(lat, lng, rad);
        return ResponseEntity.ok(ApiResponse.success(Map.of("stations", stations)));
    }
}
