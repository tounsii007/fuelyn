package com.tankpilot.api.model.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "station_meta")
public class StationMeta {

    @Id
    @Column(length = 64)
    private String id;

    private String name;

    private String brand;

    private Double lat;

    private Double lng;

    private String street;

    private String city;

    @Column(length = 10)
    private String postCode;

    private LocalDateTime updatedAt;

    public StationMeta() {
    }

    public StationMeta(String id, String name, String brand, Double lat, Double lng,
                       String street, String city, String postCode) {
        this.id = id;
        this.name = name;
        this.brand = brand;
        this.lat = lat;
        this.lng = lng;
        this.street = street;
        this.city = city;
        this.postCode = postCode;
        this.updatedAt = LocalDateTime.now();
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

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
