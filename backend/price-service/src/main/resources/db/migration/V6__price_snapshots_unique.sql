-- ============================================================
-- V6 — UNIQUE (station_id, fuel_type, timestamp) on price_snapshots
--
-- Why:
--   The composite *index* on (station_id, fuel_type, timestamp)
--   from V1 makes the equality lookup fast but does not prevent
--   duplicate snapshots being persisted. Two scheduler nodes
--   whose ShedLock windows briefly overlap, a Tankerkönig retry
--   that races a recovered earlier call, or a backfill replay
--   can each INSERT identical rows. The downstream sparkline /
--   AI features then see phantom "ticks" that aren't real
--   price changes.
--
-- Strategy:
--   1) Dedupe what's already in the table — keep the lowest id
--      per (station_id, fuel_type, timestamp) tuple.
--   2) Promote the existing composite index to a UNIQUE
--      constraint. Postgres rebuilds the underlying index in
--      place; H2 (used by tests) accepts the same syntax.
--
-- The portable SQL constraint is a *defence in depth* — the
-- application-side dedupe (price-change check in
-- persistAndPublishIfChanged) is still the first line. The DB
-- constraint catches what the app cannot see across nodes.
-- ============================================================

DELETE FROM price_snapshots
WHERE id NOT IN (
    SELECT MIN(id)
    FROM price_snapshots
    GROUP BY station_id, fuel_type, timestamp
);

-- Drop the non-unique composite index from V1 — the unique
-- constraint will create its own backing index (same columns,
-- same order). Keeping both wastes write amplification on every
-- insert.
DROP INDEX IF EXISTS idx_snapshot_composite;

ALTER TABLE price_snapshots
    ADD CONSTRAINT uq_snapshot_station_fuel_ts
    UNIQUE (station_id, fuel_type, timestamp);
