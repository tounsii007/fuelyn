-- ============================================================
-- V7 — drop columns no longer mapped by any entity
--
-- price_collection_count was declared in V1 with the intent of
-- tracking how many cycles each station appeared in, but the value
-- has never been incremented anywhere in the codebase (verified by
-- repository / service grep). The corresponding entity field was
-- removed in the same commit; with hibernate ddl-auto=validate the
-- mapping check now succeeds without the column, but leaving the
-- column behind would be silent storage debt.
--
-- Both Postgres and H2 support DROP COLUMN IF EXISTS — the test
-- suite re-runs migrations on a fresh H2 each boot, so the IF EXISTS
-- guard isn't strictly required, but it makes re-running the
-- migration on a partially-migrated environment safe.
-- ============================================================

ALTER TABLE station_meta DROP COLUMN IF EXISTS price_collection_count;
