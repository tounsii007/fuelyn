package com.fuelyn.api.repository;

import com.fuelyn.api.model.entity.PriceSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface PriceSnapshotRepository extends JpaRepository<PriceSnapshot, Long> {

    List<PriceSnapshot> findByStationIdAndFuelTypeAndTimestampAfterOrderByTimestampAsc(
            String stationId, String fuelType, LocalDateTime after);

    @Query("SELECT AVG(p.price) FROM PriceSnapshot p " +
            "WHERE p.stationId = :stationId AND p.fuelType = :fuelType AND p.timestamp > :after")
    Double findAveragePrice(@Param("stationId") String stationId,
                            @Param("fuelType") String fuelType,
                            @Param("after") LocalDateTime after);

    @Query("SELECT p.stationId, AVG(p.price) as avgPrice, MIN(p.price) as minPrice, MAX(p.price) as maxPrice " +
            "FROM PriceSnapshot p WHERE p.fuelType = :fuelType AND p.timestamp > :after " +
            "GROUP BY p.stationId ORDER BY avgPrice ASC")
    List<Object[]> findAreaStats(@Param("fuelType") String fuelType,
                                 @Param("after") LocalDateTime after);

    @Query(value = "SELECT EXTRACT(DOW FROM p.timestamp) as dow, AVG(p.price) as avgPrice " +
            "FROM price_snapshots p WHERE p.station_id = :stationId AND p.fuel_type = :fuelType " +
            "AND p.timestamp > :after " +
            "GROUP BY EXTRACT(DOW FROM p.timestamp) ORDER BY dow", nativeQuery = true)
    List<Object[]> findDayOfWeekPattern(@Param("stationId") String stationId,
                                        @Param("fuelType") String fuelType,
                                        @Param("after") LocalDateTime after);

    long countByTimestampAfter(LocalDateTime after);

    @Modifying
    void deleteByTimestampBefore(LocalDateTime before);
}
