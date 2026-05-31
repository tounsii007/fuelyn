package com.fuelyn.price.config;

import java.util.ArrayList;
import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Externalised price-collection configuration.
 *
 * <p>Mirrors the {@code fuelyn.collection.*} section of {@code application.yml}. The polling grid
 * lives here rather than in code so operations can extend or trim coverage without a recompile —
 * useful when onboarding a new region, draining a misbehaving Tankerkönig sector during an outage,
 * or A/B-ing two grids on the same build artifact.
 *
 * <p>Validation of the entries themselves (coordinate bounds, non-blank name) lives in {@code
 * PriceCollectorService.resolveCities} so the boot still proceeds with a warning instead of
 * crashing on a single typo. Hard-failing on configuration errors here would mean a single
 * misplaced decimal blocks every other deployment artifact.
 */
@Configuration
@ConfigurationProperties(prefix = "fuelyn.collection")
public class CollectionProperties {

    /**
     * Optional override of the in-code default polling grid. Empty / unset → {@code
     * PriceCollectorService.DEFAULT_CITIES} is used.
     */
    private List<CityConfig> cities = new ArrayList<>();

    public List<CityConfig> getCities() {
        return cities;
    }

    public void setCities(List<CityConfig> cities) {
        this.cities = cities;
    }

    /** Single polling-grid entry. Coordinates are decimal degrees, WGS-84. */
    public static class CityConfig {
        private String name;
        private double lat;
        private double lng;

        public String getName() {
            return name;
        }

        public void setName(String name) {
            this.name = name;
        }

        public double getLat() {
            return lat;
        }

        public void setLat(double lat) {
            this.lat = lat;
        }

        public double getLng() {
            return lng;
        }

        public void setLng(double lng) {
            this.lng = lng;
        }
    }
}
