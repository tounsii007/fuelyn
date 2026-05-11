package com.fuelyn.price.repository;

import com.fuelyn.price.model.entity.PriceReport;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;

/**
 * Read/write repository for crowdsourced price-correction reports.
 *
 * <p>The custom queries are intentionally narrow — anything beyond
 * "count by fingerprint in window" lives in a dedicated review tool
 * we haven't built yet, and we don't want untyped `findBy*` derived
 * queries spreading across the codebase.</p>
 */
@Repository
public interface PriceReportRepository extends JpaRepository<PriceReport, Long> {

    /**
     * Counts reports submitted by the given client fingerprint since
     * {@code since}. Used for per-device rate-limiting in the service
     * layer (e.g. max 10 reports / 24 h).
     */
    @Query("""
        SELECT COUNT(p) FROM PriceReport p
        WHERE p.clientFingerprint = :fingerprint
          AND p.createdAt > :since
    """)
    long countByFingerprintSince(
            @Param("fingerprint") String fingerprint,
            @Param("since")        LocalDateTime since);

    /**
     * Counts reports for the given station+fuel since {@code since}.
     * Useful as a station-detail badge ("3 Nutzer haben den Preis
     * heute korrigiert"), which we surface later via the API.
     */
    long countByStationIdAndFuelTypeAndCreatedAtAfter(
            String stationId, String fuelType, LocalDateTime since);
}
