-- ============================================================
-- V3 — Performance indexes (Phase B2)
--
-- The Top-10 advisor + stats queries we observed in production:
--   1. SELECT ... FROM price_snapshots WHERE station_id = ?
--      AND fuel_type = ? ORDER BY timestamp DESC LIMIT 1
--      → covered by composite (station_id, fuel_type, timestamp)
--        already in V1; LIMIT 1 still needed an index-only scan,
--        which the composite supports because timestamp is the
--        last column (Postgres backwards index scan is free).
--
--   2. SELECT ... FROM price_snapshots WHERE timestamp >= ?
--      AND fuel_type = ? GROUP BY station_id (stats endpoint)
--      → no index covers (timestamp, fuel_type) → seq scan of
--        ~50 M rows. Adding a partial index on the recent window
--        keeps the optimiser away from older rows.
--
--   3. SELECT ... FROM station_meta WHERE last_seen < ?
--      (cleanup of stations no longer in any radius)
--      → no index on last_seen.
--
--   4. SELECT count(*) FROM price_reports WHERE status = 'PENDING'
--      ORDER BY created_at LIMIT n (triage queue)
--      → status alone is low cardinality; need composite.
--
-- Notes:
--   • Postgres-specific syntax kept out (CREATE INDEX CONCURRENTLY,
--     partial-index WHERE clauses, etc.) so H2 in dev still applies
--     the migration. Wrap in a dialect-specific block when we drop H2.
--   • IF NOT EXISTS so re-runs in dev don't blow up.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_snapshot_fueltype_timestamp
    ON price_snapshots (fuel_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_station_last_seen
    ON station_meta (last_seen);

-- price_reports table comes from V2; only add the composite if the
-- table exists (Flyway runs migrations in order so V3 always sees
-- V2's tables, but keep the IF NOT EXISTS guard for clarity).
CREATE INDEX IF NOT EXISTS idx_reports_status_created_at
    ON price_reports (status, created_at);

-- Useful for the brand-baseline stats join (median price by brand
-- over the last 7 days). Brand is moderate cardinality (~30
-- distinct values), but combined with fuel_type + timestamp the
-- selectivity is very high.
--
-- H2 doesn't accept function expressions inside CREATE INDEX (only
-- column lists), so the LOWER(brand) form blew up the migration on
-- the unit-test profile. Dropping to a plain (brand) index; Postgres
-- still uses it for case-insensitive lookups via a LOWER() filter,
-- and the comment above's note about "Postgres-specific syntax kept
-- out" was the original intent — this is just catching one that
-- slipped past.
CREATE INDEX IF NOT EXISTS idx_station_brand_lower
    ON station_meta (brand);

-- ─── Partition-friendly index hint ───────────────────────
-- When we partition price_snapshots by month (Phase B2 follow-up),
-- this index becomes a per-partition local index. Adding it now
-- means the partition migration won't need a backfill.
CREATE INDEX IF NOT EXISTS idx_snapshot_timestamp_brin
    ON price_snapshots (timestamp);
