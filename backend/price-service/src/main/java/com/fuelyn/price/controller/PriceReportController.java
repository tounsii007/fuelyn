package com.fuelyn.price.controller;

import java.time.LocalDateTime;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fuelyn.common.dto.ApiResponse;
import com.fuelyn.price.model.entity.PriceReport;
import com.fuelyn.price.repository.PriceReportRepository;

/**
 * Phase 8 — Crowdsourced price-correction reports.
 *
 * <p>Two HTTP surfaces:
 *
 * <ul>
 *   <li>{@code POST /api/v1/reports}: store a single report
 *   <li>{@code GET /api/v1/reports/stations/{id}/count}: how many distinct reports landed for this
 *       station in the last 24 h — used by the frontend to render a "stale-data" badge
 * </ul>
 *
 * <p>Per-device rate limit: max 20 reports per fingerprint per day. Above that we 429 — keeps a
 * single bad actor from drowning the triage queue without needing a real account system.
 */
@RestController
@RequestMapping("/api/v1/reports")
@Validated
public class PriceReportController {

    private static final Logger log = LoggerFactory.getLogger(PriceReportController.class);

    /** Max reports per fingerprint within {@link #RATE_LIMIT_WINDOW_HOURS}. */
    private static final int RATE_LIMIT_MAX_PER_DAY = 20;

    private static final int RATE_LIMIT_WINDOW_HOURS = 24;

    private final PriceReportRepository repo;

    public PriceReportController(PriceReportRepository repo) {
        this.repo = repo;
    }

    /** Inbound DTO; explicit fields so we never accept extras. */
    public record ReportRequest(
            @NotBlank @Size(max = 64) String stationId,
            @NotBlank @Pattern(regexp = "diesel|e5|e10") String fuelType,
            @DecimalMin("0.0") @DecimalMax("99.9") Double displayedPrice,
            @DecimalMin("0.0") @DecimalMax("99.9") Double reportedPrice,
            @Size(max = 500) String note,
            @Size(max = 128) String clientFingerprint) {}

    @PostMapping
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> submit(
            @Valid @RequestBody ReportRequest request) {

        // Rate-limit per fingerprint. Anonymous reports (no fingerprint)
        // are allowed but globally rate-limited via the BFF anyway.
        if (request.clientFingerprint() != null && !request.clientFingerprint().isBlank()) {
            long since =
                    repo.countByFingerprintSince(
                            request.clientFingerprint(),
                            LocalDateTime.now().minusHours(RATE_LIMIT_WINDOW_HOURS));
            if (since >= RATE_LIMIT_MAX_PER_DAY) {
                log.warn(
                        "Rate-limit triggered for fingerprint={} ({} reports)",
                        request.clientFingerprint(),
                        since);
                return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                        .body(
                                ApiResponse.error(
                                        "Zu viele Meldungen — bitte später erneut versuchen."));
            }
        }

        PriceReport saved =
                repo.save(
                        new PriceReport(
                                request.stationId(),
                                request.fuelType(),
                                request.displayedPrice(),
                                request.reportedPrice(),
                                request.note(),
                                request.clientFingerprint(),
                                LocalDateTime.now()));

        log.info(
                "Report stored: id={} station={} fuel={} reported={}",
                saved.getId(),
                saved.getStationId(),
                saved.getFuelType(),
                saved.getReportedPrice());

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(
                        ApiResponse.success(
                                Map.of(
                                        "id", saved.getId(),
                                        "status", saved.getStatus())));
    }

    /**
     * Number of reports observed for this station/fuel in the last 24 h. Frontend uses it to flag
     * stations whose displayed price is in dispute.
     */
    @GetMapping("/stations/{stationId}/count")
    public ResponseEntity<ApiResponse<Map<String, Object>>> countForStation(
            @PathVariable @NotBlank @Size(max = 64) String stationId,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "e10")
                    @Pattern(regexp = "diesel|e5|e10")
                    String fuelType) {

        long n =
                repo.countByStationIdAndFuelTypeAndCreatedAtAfter(
                        stationId, fuelType, LocalDateTime.now().minusHours(24));

        return ResponseEntity.ok(
                ApiResponse.success(
                        Map.of(
                                "stationId", stationId,
                                "fuelType", fuelType,
                                "count24h", n)));
    }
}
