package com.fuelyn.price.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

/**
 * Closes the regret-loop on the {@code recommendation_logs} telemetry
 * written by ai-service.
 *
 * <h3>What it does</h3>
 * <p>For each row whose request is at least 24 h old and hasn't been
 * backfilled yet, look up the minimum price observed in the same
 * lat/lng bucket and fuel type during the 24 h immediately following
 * the request. Compute regret in € as:</p>
 *
 * <pre>
 *   regret_eur = max(0, recommended_price − realized_min_24h) × liters
 * </pre>
 *
 * <p>Regret is clamped to zero from below: if our suggestion was
 * cheaper than anything that materialised, the user "won" — we don't
 * award negative regret because that would muddle the gradient when
 * later tuning weights.</p>
 *
 * <h3>Why bucket-based rather than station-based</h3>
 * <p>The telemetry intentionally stores only a 0.01° (~1 km) lat/lng
 * bucket — no station IDs, no user identifier. This protects user
 * privacy at the cost of slightly fuzzy backfill: we measure the
 * cheapest reachable price <em>in the same neighbourhood</em>, which
 * is exactly the counter-factual the advisor is reasoning about.</p>
 *
 * <h3>Performance</h3>
 * <p>The bucket lookup uses range predicates ({@code sm.lat BETWEEN
 * bucket±0.005}) so the {@code idx_station_latlng} btree index is
 * usable. Each backfill query touches a handful of stations × 24 h
 * of snapshots — sub-millisecond at our scale. Batches of 500 rows
 * keep memory bounded if a long outage left a backlog.</p>
 */
@Service
public class RegretBackfillService {

    private static final Logger log = LoggerFactory.getLogger(RegretBackfillService.class);

    /** Minimum age of a row before we backfill it. */
    private static final long MIN_AGE_HOURS = 24;
    /** Window after the request during which we measure the min price. */
    private static final long WINDOW_HOURS  = 24;
    /** Bucket half-width (must match RegretLogger#roundToBucket in ai-service). */
    private static final double BUCKET_HALF = 0.005;

    private final JdbcTemplate jdbc;
    private final int batchSize;

    public RegretBackfillService(
            JdbcTemplate jdbc,
            @Value("${fuelyn.regret.backfill.batch-size:500}") int batchSize
    ) {
        this.jdbc = jdbc;
        this.batchSize = Math.max(50, batchSize);
    }

    /** One row pulled from {@code recommendation_logs} for backfilling. */
    private record PendingLog(
            long id,
            Instant tsRequest,
            String fuelType,
            double latBucket,
            double lngBucket,
            Double liters,
            Double recommendedPrice
    ) {}

    /**
     * Run one backfill pass. Returns the number of rows that received
     * a non-null {@code regret_eur}. Idempotent — already-filled rows
     * are skipped via the {@code backfilled_at IS NULL} predicate.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int runOnce() {
        Instant cutoff = Instant.now().minus(MIN_AGE_HOURS, ChronoUnit.HOURS);

        List<PendingLog> pending = jdbc.query(
                """
                SELECT id, ts_request, fuel_type, lat_bucket, lng_bucket, liters, recommended_price
                FROM   recommendation_logs
                WHERE  backfilled_at IS NULL
                  AND  ts_request <= ?
                ORDER  BY ts_request ASC
                LIMIT  ?
                """,
                (rs, n) -> new PendingLog(
                        rs.getLong("id"),
                        rs.getTimestamp("ts_request").toInstant(),
                        rs.getString("fuel_type"),
                        rs.getDouble("lat_bucket"),
                        rs.getDouble("lng_bucket"),
                        (Double) rs.getObject("liters"),
                        (Double) rs.getObject("recommended_price")
                ),
                Timestamp.from(cutoff),
                batchSize
        );

        if (pending.isEmpty()) {
            log.debug("Regret backfill — nothing to do");
            return 0;
        }

        int filled = 0;
        int skipped = 0;
        // Collect results first, then issue a single JDBC batchUpdate.
        // Per-row jdbc.update() through a 500-row pass meant 500 separate
        // PreparedStatement round-trips; batchUpdate folds them into one
        // protocol exchange (or driver-level batching) and stays trivially
        // cancellable on shutdown.
        List<StampParams> stampBatch = new ArrayList<>(pending.size());
        for (PendingLog row : pending) {
            BackfillResult result = backfillRow(row);
            if (result.regretEur != null) filled++;
            else skipped++;
            stampBatch.add(new StampParams(row.id, result));
        }
        stampAll(stampBatch);

        log.info("Regret backfill — pass complete: {} regret-rows, {} no-data, batch={}",
                filled, skipped, pending.size());
        return filled;
    }

    private record StampParams(long id, BackfillResult result) {}

    /** Outcome of looking up the realised 24 h minimum for one row. */
    private record BackfillResult(Double realizedMin, Instant realizedAt, Double regretEur) {}

    private BackfillResult backfillRow(PendingLog row) {
        Instant from = row.tsRequest;
        Instant to   = row.tsRequest.plus(WINDOW_HOURS, ChronoUnit.HOURS);

        // Stay strictly in the past for `to` — if the user logged a
        // request 23 h ago, we don't have the full 24 h yet. The
        // outer ts_request<=NOW()-24h filter prevents that, but a
        // belt-and-braces clamp here keeps the math obvious.
        Instant nowCap = Instant.now();
        if (to.isAfter(nowCap)) to = nowCap;

        // Look up the cheapest snapshot inside the bucket window.
        // station_meta carries the per-station coords; we pre-join
        // and rely on the lat/lng range to hit idx_station_latlng.
        return jdbc.query(
                """
                SELECT MIN(ps.price) AS min_price,
                       MIN(ps.timestamp) AS first_at
                FROM   price_snapshots ps
                JOIN   station_meta    sm ON sm.id = ps.station_id
                WHERE  ps.fuel_type = ?
                  AND  ps.timestamp >= ?
                  AND  ps.timestamp <  ?
                  AND  sm.lat >= ? AND sm.lat <  ?
                  AND  sm.lng >= ? AND sm.lng <  ?
                """,
                rs -> {
                    if (!rs.next()) return new BackfillResult(null, null, null);
                    Double minPrice = (Double) rs.getObject("min_price");
                    Timestamp firstAt = rs.getTimestamp("first_at");
                    if (minPrice == null) return new BackfillResult(null, null, null);

                    Double regret = computeRegret(row.recommendedPrice, minPrice, row.liters);
                    return new BackfillResult(
                            minPrice,
                            firstAt == null ? null : firstAt.toInstant(),
                            regret
                    );
                },
                row.fuelType,
                Timestamp.from(from),
                Timestamp.from(to),
                row.latBucket - BUCKET_HALF, row.latBucket + BUCKET_HALF,
                row.lngBucket - BUCKET_HALF, row.lngBucket + BUCKET_HALF
        );
    }

    /**
     * Visible for test — clamped at 0 from below; unknown inputs
     * collapse to null so the row still gets stamped (no infinite
     * retry) but the regret column stays empty.
     */
    static Double computeRegret(Double recommendedPrice, Double realizedMin, Double liters) {
        if (recommendedPrice == null || realizedMin == null) return null;
        double l = (liters == null || liters <= 0) ? 50.0 : liters;
        // recommended − realized: positive ⇒ user could have paid
        // less had they waited; negative ⇒ our advice was right.
        double diff = recommendedPrice - realizedMin;
        if (diff <= 0) return 0.0;
        return Math.round(diff * l * 100.0) / 100.0;
    }

    /**
     * Single-statement batch stamp. Always sets backfilled_at so a row
     * with no useful realised data still leaves the pending pool — the
     * outer loop won't reprocess it forever.
     */
    private void stampAll(List<StampParams> rows) {
        if (rows.isEmpty()) {
            return;
        }
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.batchUpdate(
                """
                UPDATE recommendation_logs
                   SET realized_min_24h = ?,
                       realized_at      = ?,
                       regret_eur       = ?,
                       backfilled_at    = ?
                 WHERE id = ?
                """,
                new org.springframework.jdbc.core.BatchPreparedStatementSetter() {
                    @Override
                    public void setValues(PreparedStatement ps, int i) throws SQLException {
                        StampParams p = rows.get(i);
                        BackfillResult r = p.result();
                        if (r.realizedMin == null) ps.setNull(1, Types.DOUBLE);
                        else                       ps.setDouble(1, r.realizedMin);
                        if (r.realizedAt == null)  ps.setNull(2, Types.TIMESTAMP);
                        else                       ps.setTimestamp(2, Timestamp.from(r.realizedAt));
                        if (r.regretEur == null)   ps.setNull(3, Types.DOUBLE);
                        else                       ps.setDouble(3, r.regretEur);
                        ps.setTimestamp(4, now);
                        ps.setLong(5, p.id());
                    }

                    @Override
                    public int getBatchSize() {
                        return rows.size();
                    }
                }
        );
    }
}
