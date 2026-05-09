-- ============================================================
-- V5 — Recommendation regret-loop telemetry
--
-- Purpose: persist every advisor verdict in a privacy-preserving,
-- aggregate-friendly schema so a nightly cron can backfill the
-- *actual* minimum price observed in the same area within 24 h
-- and compute regret = (realized − recommended) × liters. That
-- regret stream is the empirical signal we need to tune the
-- Bayesian prior weights instead of relying on intuition.
--
-- Privacy guarantees baked into the schema:
--   • lat/lng are stored as 0.01° BUCKETS (≈ 1 km grid). A bucket
--     cannot be tied back to an individual user/device.
--   • No request_id, no user_id, no IP, no UA. The only personal
--     vector is the bucket itself, mitigated by the resolution.
--   • `liters` is the requested fill-up size, not consumption.
--
-- Portable SQL only (Postgres + H2) — see V1 for the rationale.
-- ============================================================

CREATE TABLE recommendation_logs (
    id                  BIGINT           NOT NULL PRIMARY KEY,

    -- ─── Decision context (written immediately) ──────────────
    ts_request          TIMESTAMP        NOT NULL,
    fuel_type           VARCHAR(10)      NOT NULL,
    lat_bucket          DOUBLE PRECISION NOT NULL,
    lng_bucket          DOUBLE PRECISION NOT NULL,
    liters              DOUBLE PRECISION,
    station_count       INTEGER          NOT NULL DEFAULT 0,
    recommended_action  VARCHAR(16)      NOT NULL,  -- BUY_NOW | WAIT | WAIT_LONG
    recommended_price   DOUBLE PRECISION,           -- best price at request time
    confidence          DOUBLE PRECISION,
    from_ai             BOOLEAN          NOT NULL DEFAULT FALSE,

    -- ─── Realisation (written by the nightly cron 24h later) ─
    realized_min_24h    DOUBLE PRECISION,           -- NULL until backfilled
    realized_at         TIMESTAMP,                  -- NULL until backfilled
    regret_eur          DOUBLE PRECISION,           -- NULL until backfilled
    backfilled_at       TIMESTAMP                   -- NULL until backfilled
);

-- Cron-job lookups: "all rows from yesterday that aren't backfilled"
CREATE INDEX idx_reclog_ts_request   ON recommendation_logs (ts_request);
CREATE INDEX idx_reclog_backfilled   ON recommendation_logs (backfilled_at);
-- Bucket lookups for offline analysis ("regret in Marburg")
CREATE INDEX idx_reclog_bucket       ON recommendation_logs (lat_bucket, lng_bucket);
-- Composite for the cron's main query (find unfilled rows by age)
CREATE INDEX idx_reclog_pending      ON recommendation_logs (backfilled_at, ts_request);

CREATE SEQUENCE recommendation_logs_seq START WITH 1 INCREMENT BY 50;
