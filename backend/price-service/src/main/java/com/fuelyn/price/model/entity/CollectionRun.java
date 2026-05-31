package com.fuelyn.price.model.entity;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.SequenceGenerator;
import jakarta.persistence.Table;

/**
 * Audit record for a single price collection run.
 *
 * <p>Each time the scheduler (or a manual trigger) collects prices for a city, a {@code
 * CollectionRun} is persisted with timing, counts, and outcome status. This table supports
 * operational monitoring and diagnostics.
 */
@Entity
@Table(
        name = "collection_runs",
        indexes = {
            @Index(name = "idx_run_started", columnList = "started_at"),
            @Index(name = "idx_run_status", columnList = "status"),
            @Index(name = "idx_run_city", columnList = "city")
        })
public class CollectionRun {

    /** Auto-generated surrogate primary key, backed by a portable sequence. */
    @Id
    @SequenceGenerator(
            name = "collectionRunsSeq",
            sequenceName = "collection_runs_seq",
            allocationSize = 50)
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "collectionRunsSeq")
    private Long id;

    /** Timestamp when the collection run began. */
    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    /** Timestamp when the collection run completed (null if still running). */
    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    /** Number of stations discovered during this run. */
    @Column(name = "stations_count")
    private Integer stationsCount;

    /** Number of price snapshots persisted during this run. */
    @Column(name = "prices_count")
    private Integer pricesCount;

    /** Outcome status: SUCCESS, PARTIAL_FAILURE, or FAILURE. */
    @Column(name = "status", nullable = false, length = 32)
    private String status;

    /** Error details if the run failed or partially failed. */
    @Column(name = "error_message", length = 2000)
    private String errorMessage;

    /** The city that was targeted by this collection run. */
    @Column(name = "city", length = 128)
    private String city;

    /** Default constructor required by JPA. */
    public CollectionRun() {}

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public LocalDateTime getStartedAt() {
        return startedAt;
    }

    public void setStartedAt(LocalDateTime startedAt) {
        this.startedAt = startedAt;
    }

    public LocalDateTime getCompletedAt() {
        return completedAt;
    }

    public void setCompletedAt(LocalDateTime completedAt) {
        this.completedAt = completedAt;
    }

    public Integer getStationsCount() {
        return stationsCount;
    }

    public void setStationsCount(Integer stationsCount) {
        this.stationsCount = stationsCount;
    }

    public Integer getPricesCount() {
        return pricesCount;
    }

    public void setPricesCount(Integer pricesCount) {
        this.pricesCount = pricesCount;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public void setErrorMessage(String errorMessage) {
        this.errorMessage = errorMessage;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    @Override
    public String toString() {
        return "CollectionRun{"
                + "id="
                + id
                + ", city='"
                + city
                + '\''
                + ", status='"
                + status
                + '\''
                + ", stationsCount="
                + stationsCount
                + ", pricesCount="
                + pricesCount
                + '}';
    }
}
