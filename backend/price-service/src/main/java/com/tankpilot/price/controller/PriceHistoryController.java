package com.tankpilot.price.controller;

import java.util.Map;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.tankpilot.common.dto.ApiResponse;
import com.tankpilot.price.model.dto.PriceHistoryResponse;
import com.tankpilot.price.service.PriceHistoryService;

/**
 * Thin HTTP layer over {@link PriceHistoryService}. All math/aggregation lives
 * in the service so the controller stays focused on validation, mapping, and
 * response envelopes.
 */
@RestController
@RequestMapping("/api/v1/prices")
@Validated
public class PriceHistoryController {

    private static final Logger log = LoggerFactory.getLogger(PriceHistoryController.class);

    private final PriceHistoryService historyService;

    public PriceHistoryController(PriceHistoryService historyService) {
        this.historyService = historyService;
    }

    /** GET /api/v1/prices/history?stationId=...&fuelType=e10&days=30 */
    @GetMapping("/history")
    public ResponseEntity<ApiResponse<PriceHistoryResponse>> getHistory(
            @RequestParam @NotBlank String stationId,
            @RequestParam(defaultValue = "e10") @Pattern(regexp = "diesel|e5|e10") String fuelType,
            @RequestParam(defaultValue = "30") @Min(1) @Max(90) int days) {
        log.info("Price history: stationId={}, fuelType={}, days={}", stationId, fuelType, days);
        return ResponseEntity.ok(
                ApiResponse.success(historyService.getHistory(stationId, fuelType, days)));
    }

    /** GET /api/v1/prices/stats?lat=...&lng=...&radiusKm=10&fuelType=e10&days=7 */
    @GetMapping("/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getAreaStats(
            @RequestParam @DecimalMin("-90.0") @DecimalMax("90.0") double lat,
            @RequestParam @DecimalMin("-180.0") @DecimalMax("180.0") double lng,
            @RequestParam(defaultValue = "10") @DecimalMin("1.0") @DecimalMax("25.0") double radiusKm,
            @RequestParam(defaultValue = "e10") @Pattern(regexp = "diesel|e5|e10") String fuelType,
            @RequestParam(defaultValue = "7") @Min(1) @Max(90) int days) {
        log.info(
                "Area stats: lat={}, lng={}, radius={}km, fuel={}, days={}",
                lat, lng, radiusKm, fuelType, days);
        return ResponseEntity.ok(
                ApiResponse.success(historyService.getAreaStats(lat, lng, radiusKm, fuelType, days)));
    }

    /** GET /api/v1/prices/health */
    @GetMapping("/health")
    public ResponseEntity<ApiResponse<Map<String, Object>>> health() {
        return ResponseEntity.ok(
                ApiResponse.success(Map.of("service", "price-service", "status", "UP")));
    }
}
