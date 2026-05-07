package com.fuelyn.price.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * Persistent metadata for a fuel station sourced from the Tankerkoenig API.
 *
 * <p>The primary key is the Tankerkoenig UUID ({@code id}), which remains stable
 * across API calls. Station metadata is upserted on each collection run so that
 * name, brand, and address fields stay current.</p>
 *
 * <p>The {@code priceCollectionCount} field tracks how many times prices have
 * been successfully collected for this station, providing a simple data-quality
 * indicator.</p>
 */
@Entity
@Table(
    name = "station_meta",
    indexes = {
        @Index(name = "idx_station_city", columnList = "city"),
        @Index(name = "idx_station_brand", columnList = "brand"),
        @Index(name = "idx_station_coords", columnList = "lat, lng")
    }
)
public class StationMeta {

    /** Tankerkoenig station UUID (serves as the natural primary key). */
    @Id
    @Column(name = "id", length = 64)
    private String id;

    /** Human-readable station name. */
    @Column(name = "name", length = 255)
    private String name;

    /** Station brand (e.g., Shell, Aral, ESSO). */
    @Column(name = "brand", length = 128)
    private String brand;

    /** Station latitude in decimal degrees. */
    @Column(name = "lat")
    private Double lat;

    /** Station longitude in decimal degrees. */
    @Column(name = "lng")
    private Double lng;

    /** Street address. */
    @Column(name = "street", length = 255)
    private String street;

    /** City or municipality name. */
    @Column(name = "city", length = 128)
    private String city;

    /** Postal code. */
    @Column(name = "post_code", length = 10)
    private String postCode;

    /** Timestamp of the most recent successful price collection for this station. */
    @Column(name = "last_seen")
    private LocalDateTime lastSeen;

    /** Number of successful price collection runs that included this station. */
    @Column(name = "price_collection_count")
    private Integer priceCollectionCount;

    /**
     * Default constructor required by JPA.
     */
    public StationMeta() {
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getBrand() {
        return brand;
    }

    public void setBrand(String brand) {
        this.brand = brand;
    }

    public Double getLat() {
        return lat;
    }

    public void setLat(Double lat) {
        this.lat = lat;
    }

    public Double getLng() {
        return lng;
    }

    public void setLng(Double lng) {
        this.lng = lng;
    }

    public String getStreet() {
        return street;
    }

    public void setStreet(String street) {
        this.street = street;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    public String getPostCode() {
        return postCode;
    }

    public void setPostCode(String postCode) {
        this.postCode = postCode;
    }

    public LocalDateTime getLastSeen() {
        return lastSeen;
    }

    public void setLastSeen(LocalDateTime lastSeen) {
        this.lastSeen = lastSeen;
    }

    public Integer getPriceCollectionCount() {
        return priceCollectionCount;
    }

    public void setPriceCollectionCount(Integer priceCollectionCount) {
        this.priceCollectionCount = priceCollectionCount;
    }

    @Override
    public String toString() {
        return "StationMeta{" +
                "id='" + id + '\'' +
                ", name='" + name + '\'' +
                ", brand='" + brand + '\'' +
                ", city='" + city + '\'' +
                '}';
    }
}
