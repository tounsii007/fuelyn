package com.fuelyn.price.controller;

import com.fuelyn.common.dto.ApiResponse;
import com.fuelyn.price.model.dto.CollectionResult;
import com.fuelyn.price.service.PriceCollectorService;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Endpoints to manually trigger price collection.
 * Protected by service authentication in production.
 */
@RestController
@RequestMapping("/api/v1/collect")
@Validated
public class PriceCollectionController {

    private static final Logger log = LoggerFactory.getLogger(PriceCollectionController.class);

    private final PriceCollectorService collectorService;

    public PriceCollectionController(PriceCollectorService collectorService) {
        this.collectorService = collectorService;
    }

    /**
     * POST /api/v1/collect — Triggers collection for all configured cities.
     */
    @PostMapping
    public ResponseEntity<ApiResponse<CollectionResult>> triggerCollection() {
        log.info("Manual price collection triggered");
        CollectionResult result = collectorService.collectAll();
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * POST /api/v1/collect/area — Triggers collection for a specific area.
     *
     * <p>Optional {@code name} ends up as the {@code cityName} label in the
     * structured collection log line — a free-form tag for operations to
     * trace ad-hoc collection runs back to a ticket / change ID. Constrained
     * to safe-printable characters so it can never inject control sequences
     * into log files or downstream metrics labels.</p>
     */
    @PostMapping("/area")
    public ResponseEntity<ApiResponse<CollectionResult>> collectArea(
            @RequestParam @DecimalMin("-90.0") @DecimalMax("90.0") double lat,
            @RequestParam @DecimalMin("-180.0") @DecimalMax("180.0") double lng,
            @RequestParam(defaultValue = "10")
                @DecimalMin("1.0") @DecimalMax("25.0") double radiusKm,
            @RequestParam(defaultValue = "Custom")
                @Size(max = 64)
                @Pattern(regexp = "[A-Za-z0-9 _.\\-]+",
                        message = "name must be alphanumeric / space / dot / dash / underscore")
                String name
    ) {
        log.info("Area collection triggered: lat={}, lng={}, radius={}km, name={}", lat, lng, radiusKm, name);
        CollectionResult result = collectorService.collectForArea(lat, lng, name);
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}
