-- ============================================================
-- V2 — Crowdsourced price-correction reports.
--
-- Phase 8: when a user spots a stale or wrong price they tap
-- "Preis melden" on the station card; the frontend POSTs the
-- observed value to /api/reports which lands in this table.
--
-- Design notes:
--   • `client_fingerprint` is a stable per-device hash sent by the
--     BFF (we never see PII). It lets us rate-limit later without
--     a real account system: max N reports per fingerprint per day.
--   • `observed_at` is the wall-clock the user was looking at the
--     screen, not the row insert time — useful for forensics if
--     the report seems suspicious.
--   • `status` follows a tiny moderation FSM:
--       PENDING (default) → triaged-once
--       VALIDATED         → confirmed by a second observer or admin
--       REJECTED          → spam / out-of-date
--     The full moderation UI is a separate feature; the column is
--     here so we don't need a migration when we add it.
--   • We store the *displayed* price too, so reviewers can see the
--     drift the user actually objected to.
-- ============================================================

CREATE TABLE IF NOT EXISTS price_reports (
    id                  BIGSERIAL PRIMARY KEY,
    station_id          VARCHAR(64)     NOT NULL,
    fuel_type           VARCHAR(10)     NOT NULL,
    displayed_price     DOUBLE PRECISION,
    reported_price      DOUBLE PRECISION,
    note                VARCHAR(500),
    client_fingerprint  VARCHAR(128),
    observed_at         TIMESTAMP       NOT NULL,
    created_at          TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status              VARCHAR(16)     NOT NULL DEFAULT 'PENDING'
);

-- Lookups by station are the hot path — every station-detail view
-- could fetch "recent reports for this station" to flag stale data
-- with a UI badge.
CREATE INDEX IF NOT EXISTS idx_reports_station       ON price_reports (station_id, fuel_type, observed_at DESC);
-- Rate-limit lookup: count reports per fingerprint in the last day.
CREATE INDEX IF NOT EXISTS idx_reports_fingerprint   ON price_reports (client_fingerprint, created_at DESC);
-- Triage queue lookup ("show me all PENDING reports newest-first").
CREATE INDEX IF NOT EXISTS idx_reports_status_recent ON price_reports (status, created_at DESC);
