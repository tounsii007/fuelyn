-- ============================================================
-- V4 — User accounts + cross-device sync (Phase C2/C3)
--
-- Schema is intentionally minimal so a rollback / pivot stays
-- cheap. The auth layer itself (magic-link, OAuth, password
-- reset) is implemented in code, not in the DB.
--
-- Why not just use a remote IdP (Auth0, Clerk, Supabase)?
--   • Cost / vendor lock-in
--   • DSGVO data residency (Frankfurt > us-east-1)
--   • The user model is small enough that hosting it ourselves
--     stays under a few hours of ops budget per month
-- ============================================================

CREATE TABLE users (
    id              VARCHAR(36)  NOT NULL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    email_verified  BOOLEAN      NOT NULL DEFAULT FALSE,
    locale          VARCHAR(8)   NOT NULL DEFAULT 'de-DE',
    created_at      TIMESTAMP    NOT NULL,
    last_login_at   TIMESTAMP,
    is_premium      BOOLEAN      NOT NULL DEFAULT FALSE,
    premium_until   TIMESTAMP
);

CREATE INDEX idx_users_email          ON users (email);
CREATE INDEX idx_users_last_login_at  ON users (last_login_at);

-- ─── Magic-link tokens ─────────────────────────────────────
-- Single-use, time-limited (15 min). Hashed at rest so a leaked
-- DB dump doesn't leak active sessions.
CREATE TABLE magic_link_tokens (
    token_hash    VARCHAR(64)  NOT NULL PRIMARY KEY,
    user_id       VARCHAR(36)  NOT NULL,
    issued_at     TIMESTAMP    NOT NULL,
    expires_at    TIMESTAMP    NOT NULL,
    used_at       TIMESTAMP,
    request_ip    VARCHAR(64),
    request_ua    VARCHAR(512)
);

CREATE INDEX idx_magic_link_user_id   ON magic_link_tokens (user_id);
CREATE INDEX idx_magic_link_expires   ON magic_link_tokens (expires_at);

-- ─── User preferences (cross-device) ───────────────────────
-- Stored as JSON blob so we don't ship a migration every time
-- the UI adds a new toggle. Schema is enforced by the BFF layer
-- (Zod) before the row is written.
--   Common keys:
--     • favorites:       string[]  (station IDs)
--     • compareIds:      string[]
--     • vehicleProfile:  { drive, consumption, fuelType }
--     • alertThresholds: { diesel?: number, e5?: number, e10?: number }
--     • savedLocations:  Array<{ label, lat, lng }>
CREATE TABLE user_preferences (
    user_id       VARCHAR(36)  NOT NULL PRIMARY KEY,
    payload_json  TEXT         NOT NULL,
    updated_at    TIMESTAMP    NOT NULL,
    sync_version  INTEGER      NOT NULL DEFAULT 1
);

-- ─── Active sessions ───────────────────────────────────────
-- One row per device/browser. JWTs are stateless but we still
-- track sessions so the user can revoke "Tablet im Café" without
-- waiting for the JWT TTL.
CREATE TABLE user_sessions (
    id            VARCHAR(36)  NOT NULL PRIMARY KEY,
    user_id       VARCHAR(36)  NOT NULL,
    issued_at     TIMESTAMP    NOT NULL,
    last_seen_at  TIMESTAMP    NOT NULL,
    revoked_at    TIMESTAMP,
    user_agent    VARCHAR(512),
    ip_address    VARCHAR(64)
);

CREATE INDEX idx_sessions_user_id     ON user_sessions (user_id);
CREATE INDEX idx_sessions_last_seen   ON user_sessions (last_seen_at);
