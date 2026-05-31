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
 * Represents a single fuel price observation at a specific station and point in time.
 *
 * <p>Each snapshot captures the price for one fuel type (diesel, e5, or e10) at one station. These
 * records form the core of the price history and are used to compute statistics, trends, and
 * day-of-week patterns.
 *
 * <p>The table includes a composite index on {@code (station_id, fuel_type, timestamp)} to support
 * efficient queries for station-specific price histories.
 */
@Entity
@Table(
        name = "price_snapshots",
        indexes = {
            @Index(name = "idx_snapshot_station", columnList = "station_id"),
            @Index(name = "idx_snapshot_timestamp", columnList = "timestamp"),
            @Index(name = "idx_snapshot_composite", columnList = "station_id, fuel_type, timestamp")
        })
public class PriceSnapshot {

    /** Auto-generated surrogate primary key, backed by a portable sequence. */
    @Id
    @SequenceGenerator(
            name = "priceSnapshotsSeq",
            sequenceName = "price_snapshots_seq",
            allocationSize = 50)
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "priceSnapshotsSeq")
    private Long id;

    /** Tankerkoenig station UUID. */
    @Column(name = "station_id", nullable = false, length = 64)
    private String stationId;

    /** Fuel type: diesel, e5, or e10. */
    @Column(name = "fuel_type", nullable = false, length = 10)
    private String fuelType;

    /** Price in EUR per liter. */
    @Column(name = "price", nullable = false)
    private Double price;

    /** Timestamp when this price was observed. */
    @Column(name = "timestamp", nullable = false)
    private LocalDateTime timestamp;

    /** Default constructor required by JPA. */
    public PriceSnapshot() {}

    /**
     * Constructs a fully populated price snapshot.
     *
     * @param stationId the Tankerkoenig station UUID
     * @param fuelType the fuel type (diesel, e5, e10)
     * @param price the price in EUR per liter
     * @param timestamp the observation timestamp
     */
    public PriceSnapshot(String stationId, String fuelType, Double price, LocalDateTime timestamp) {
        this.stationId = stationId;
        this.fuelType = fuelType;
        this.price = price;
        this.timestamp = timestamp;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getStationId() {
        return stationId;
    }

    public void setStationId(String stationId) {
        this.stationId = stationId;
    }

    public String getFuelType() {
        return fuelType;
    }

    public void setFuelType(String fuelType) {
        this.fuelType = fuelType;
    }

    public Double getPrice() {
        return price;
    }

    public void setPrice(Double price) {
        this.price = price;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }

    @Override
    public String toString() {
        return "PriceSnapshot{"
                + "id="
                + id
                + ", stationId='"
                + stationId
                + '\''
                + ", fuelType='"
                + fuelType
                + '\''
                + ", price="
                + price
                + ", timestamp="
                + timestamp
                + '}';
    }
}
