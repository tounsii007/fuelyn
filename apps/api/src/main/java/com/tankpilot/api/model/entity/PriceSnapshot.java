package com.tankpilot.api.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "price_snapshots", indexes = {
        @Index(name = "idx_station_fuel", columnList = "stationId, fuelType"),
        @Index(name = "idx_timestamp", columnList = "timestamp"),
        @Index(name = "idx_station_fuel_time", columnList = "stationId, fuelType, timestamp")
})
public class PriceSnapshot {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 64)
    private String stationId;

    @Column(nullable = false, length = 10)
    private String fuelType;

    @Column(nullable = false)
    private Double price;

    @Column(nullable = false)
    private LocalDateTime timestamp;

    public PriceSnapshot() {
    }

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
}
