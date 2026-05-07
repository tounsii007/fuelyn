-- ============================================================
-- V1 — Initial price-service schema (Postgres + H2 compatible)
--
-- Portable SQL only: use BIGINT (not BIGSERIAL), use TIMESTAMP
-- without TIME ZONE, avoid dialect-specific syntax.
-- ============================================================

CREATE TABLE price_snapshots (
    id          BIGINT        NOT NULL PRIMARY KEY,
    station_id  VARCHAR(64)   NOT NULL,
    fuel_type   VARCHAR(10)   NOT NULL,
    price       DOUBLE PRECISION NOT NULL,
    timestamp   TIMESTAMP     NOT NULL
);

CREATE INDEX idx_snapshot_station   ON price_snapshots (station_id);
CREATE INDEX idx_snapshot_timestamp ON price_snapshots (timestamp);
CREATE INDEX idx_snapshot_composite ON price_snapshots (station_id, fuel_type, timestamp);

CREATE TABLE station_meta (
    id                       VARCHAR(64)  NOT NULL PRIMARY KEY,
    name                     VARCHAR(255),
    brand                    VARCHAR(128),
    lat                      DOUBLE PRECISION,
    lng                      DOUBLE PRECISION,
    street                   VARCHAR(255),
    city                     VARCHAR(128),
    post_code                VARCHAR(16),
    last_seen                TIMESTAMP,
    price_collection_count   INTEGER       DEFAULT 0
);

CREATE INDEX idx_station_city     ON station_meta (city);
CREATE INDEX idx_station_brand    ON station_meta (brand);
CREATE INDEX idx_station_latlng   ON station_meta (lat, lng);

CREATE TABLE collection_runs (
    id             BIGINT       NOT NULL PRIMARY KEY,
    started_at     TIMESTAMP    NOT NULL,
    completed_at   TIMESTAMP,
    stations_count INTEGER,
    prices_count   INTEGER,
    status         VARCHAR(32)  NOT NULL,
    error_message  VARCHAR(2000),
    city           VARCHAR(128)
);

CREATE INDEX idx_run_started_at ON collection_runs (started_at);
CREATE INDEX idx_run_status     ON collection_runs (status);
CREATE INDEX idx_run_city       ON collection_runs (city);

-- Sequence for price_snapshots IDs (portable across H2 + Postgres)
CREATE SEQUENCE price_snapshots_seq  START WITH 1 INCREMENT BY 50;
CREATE SEQUENCE collection_runs_seq  START WITH 1 INCREMENT BY 50;

-- ShedLock table for distributed scheduling
CREATE TABLE shedlock (
    name        VARCHAR(64)  NOT NULL PRIMARY KEY,
    lock_until  TIMESTAMP    NOT NULL,
    locked_at   TIMESTAMP    NOT NULL,
    locked_by   VARCHAR(255) NOT NULL
);
