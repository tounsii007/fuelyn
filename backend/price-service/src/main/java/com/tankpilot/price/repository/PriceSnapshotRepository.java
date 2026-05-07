package com.tankpilot.price.repository;

import com.tankpilot.price.model.entity.PriceSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Spring Data JPA repository for {@link PriceSnapshot} entities.
 *
 * <p>Provides efficient queries for price history, statistics, and
 * day-of-week pattern analysis. Custom queries use JPQL with proper
 * indexing on {@code (station_id, fuel_type, timestamp)}.</p>
 */
@Repository
public interface PriceSnapshotRepository extends JpaRepository<PriceSnapshot, Long> {

    /**
     * Retrieves price history for a station and fuel type after a given date.
     */
    List<PriceSnapshot> findByStationIdAndFuelTypeAndTimestampAfterOrderByTimestampAsc(
            String stationId, String fuelType, LocalDateTime after);

    /**
     * Computes average price for a station and fuel type within a time window.
     */
    @Query("SELECT AVG(p.price) FROM PriceSnapshot p " +
           "WHERE p.stationId = :stationId AND p.fuelType = :fuelType AND p.timestamp > :after")
    Double findAveragePrice(@Param("stationId") String stationId,
                            @Param("fuelType") String fuelType,
                            @Param("after") LocalDateTime after);

    /**
     * Aggregated area statistics grouped by station.
     * Returns Object[] with: [stationId, avgPrice, minPrice, maxPrice, count].
     */
    @Query("SELECT p.stationId, AVG(p.price), MIN(p.price), MAX(p.price), COUNT(p) " +
           "FROM PriceSnapshot p " +
           "WHERE p.fuelType = :fuelType AND p.timestamp > :after " +
           "GROUP BY p.stationId ORDER BY AVG(p.price) ASC")
    List<Object[]> findAreaStats(@Param("fuelType") String fuelType,
                                 @Param("after") LocalDateTime after);

    /**
     * Day-of-week price pattern analysis using DAYOFWEEK function.
     */
    @Query("SELECT FUNCTION('DAYOFWEEK', p.timestamp) AS dow, AVG(p.price) AS avgPrice " +
           "FROM PriceSnapshot p " +
           "WHERE p.stationId = :stationId AND p.fuelType = :fuelType AND p.timestamp > :after " +
           "GROUP BY FUNCTION('DAYOFWEEK', p.timestamp) " +
           "ORDER BY FUNCTION('DAYOFWEEK', p.timestamp)")
    List<Object[]> findDayOfWeekPattern(@Param("stationId") String stationId,
                                         @Param("fuelType") String fuelType,
                                         @Param("after") LocalDateTime after);

    /**
     * Retrieves snapshots for multiple stations, a fuel type, after a given date.
     */
    List<PriceSnapshot> findByStationIdInAndFuelTypeAndTimestampAfter(
            List<String> stationIds, String fuelType, LocalDateTime after);

    /**
     * Count snapshots recorded after a given timestamp (for monitoring).
     */
    long countByTimestampAfter(LocalDateTime after);

    /**
     * Delete old snapshots for data retention compliance.
     */
    @Modifying
    @Query("DELETE FROM PriceSnapshot p WHERE p.timestamp < :before")
    int deleteByTimestampBefore(@Param("before") LocalDateTime before);
}
