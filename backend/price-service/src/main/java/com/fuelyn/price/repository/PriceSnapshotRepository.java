package com.fuelyn.price.repository;

import com.fuelyn.price.model.entity.PriceSnapshot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

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
     * Returns the most recent snapshot for a (station, fuel) pair, if any.
     * Used by the streaming layer to compute price-change deltas without
     * loading the full history.
     */
    Optional<PriceSnapshot> findFirstByStationIdAndFuelTypeOrderByTimestampDesc(
            String stationId, String fuelType);

    /**
     * Batch variant of {@link #findFirstByStationIdAndFuelTypeOrderByTimestampDesc}
     * for the collection hot path: returns the most-recent snapshot per
     * (stationId, fuelType) across an entire area in a single round-trip.
     *
     * <p>The correlated subquery is portable across Postgres and H2 — both
     * recognise the equality on max(timestamp) per group and use the
     * {@code (station_id, fuel_type, timestamp)} unique index for the
     * inner aggregate. This replaces N×M individual lookups (250 stations
     * × 3 fuel types = 750 queries per area) with one.</p>
     */
    @Query("SELECT p FROM PriceSnapshot p " +
           "WHERE p.stationId IN :stationIds " +
           "  AND p.fuelType IN :fuelTypes " +
           "  AND p.timestamp = (SELECT MAX(p2.timestamp) FROM PriceSnapshot p2 " +
           "                     WHERE p2.stationId = p.stationId " +
           "                       AND p2.fuelType = p.fuelType)")
    List<PriceSnapshot> findLatestByStationIdsAndFuelTypes(
            @Param("stationIds") Collection<String> stationIds,
            @Param("fuelTypes") Collection<String> fuelTypes);

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
     *
     * <p>Used internally as the inner step of the chunked variant
     * {@code PriceCollectorService.cleanupOldData}. A single unbounded
     * DELETE on a 90-day-deep table can hold a Postgres lock on
     * price_snapshots for minutes, blocking concurrent inserts from
     * the collection cycle. Prefer {@link #deleteOldestBatch} from
     * the service layer.</p>
     */
    @Modifying
    @Query("DELETE FROM PriceSnapshot p WHERE p.timestamp < :before")
    int deleteByTimestampBefore(@Param("before") LocalDateTime before);

    /**
     * Returns the IDs of up to {@code limit} oldest snapshots beyond
     * the retention cutoff. The service deletes by ID in chunks so the
     * whole purge fits inside short transactions that don't starve the
     * polling writes.
     */
    @Query("SELECT p.id FROM PriceSnapshot p WHERE p.timestamp < :before ORDER BY p.timestamp ASC")
    List<Long> findIdsBeforeTimestamp(
            @Param("before") LocalDateTime before,
            org.springframework.data.domain.Pageable pageable);

    /**
     * Bulk delete by primary-key list. Uses the implicit pk-index for
     * O(log n) per row and stays well below typical Postgres lock-wait
     * thresholds when the chunk size is conservative (~5k).
     */
    @Modifying
    @Query("DELETE FROM PriceSnapshot p WHERE p.id IN :ids")
    int deleteByIdIn(@Param("ids") Collection<Long> ids);
}
