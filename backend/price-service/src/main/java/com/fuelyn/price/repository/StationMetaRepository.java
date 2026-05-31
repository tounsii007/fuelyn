package com.fuelyn.price.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.fuelyn.price.model.entity.StationMeta;

/**
 * Repository for {@link StationMeta} entities. Stores station metadata (name, brand, location) for
 * reference.
 */
@Repository
public interface StationMetaRepository extends JpaRepository<StationMeta, String> {

    /** Finds stations within a geographic bounding box. */
    List<StationMeta> findByLatBetweenAndLngBetween(
            double minLat, double maxLat, double minLng, double maxLng);
}
