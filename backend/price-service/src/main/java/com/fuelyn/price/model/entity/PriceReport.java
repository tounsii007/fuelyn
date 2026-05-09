package com.fuelyn.price.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * Crowdsourced price-correction report (Phase 8).
 *
 * <p>Created when a user taps "Preis melden" on a station card and
 * submits a corrected value. Lives next to {@code price_snapshots}
 * so reviewers can compare the displayed value at submission time
 * with the snapshot stream around the same timestamp.</p>
 *
 * <p>The {@link #status} field is a hand-rolled FSM (PENDING /
 * VALIDATED / REJECTED) — full moderation tooling is deferred but
 * the column is in place so we don't need another migration.</p>
 */
@Entity
@Table(name = "price_reports")
public class PriceReport {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "station_id", nullable = false, length = 64)
    private String stationId;

    @Column(name = "fuel_type", nullable = false, length = 10)
    private String fuelType;

    @Column(name = "displayed_price")
    private Double displayedPrice;

    @Column(name = "reported_price")
    private Double reportedPrice;

    @Column(name = "note", length = 500)
    private String note;

    @Column(name = "client_fingerprint", length = 128)
    private String clientFingerprint;

    @Column(name = "observed_at", nullable = false)
    private LocalDateTime observedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "status", nullable = false, length = 16)
    private String status = "PENDING";

    protected PriceReport() {
        // JPA
    }

    public PriceReport(
            String stationId,
            String fuelType,
            Double displayedPrice,
            Double reportedPrice,
            String note,
            String clientFingerprint,
            LocalDateTime observedAt
    ) {
        this.stationId = stationId;
        this.fuelType = fuelType;
        this.displayedPrice = displayedPrice;
        this.reportedPrice = reportedPrice;
        this.note = note;
        this.clientFingerprint = clientFingerprint;
        this.observedAt = observedAt;
        this.createdAt = LocalDateTime.now();
    }

    public Long              getId()                { return id; }
    public String            getStationId()         { return stationId; }
    public String            getFuelType()          { return fuelType; }
    public Double            getDisplayedPrice()    { return displayedPrice; }
    public Double            getReportedPrice()     { return reportedPrice; }
    public String            getNote()              { return note; }
    public String            getClientFingerprint() { return clientFingerprint; }
    public LocalDateTime     getObservedAt()        { return observedAt; }
    public LocalDateTime     getCreatedAt()         { return createdAt; }
    public String            getStatus()            { return status; }

    public void setStatus(String status) { this.status = status; }
}
