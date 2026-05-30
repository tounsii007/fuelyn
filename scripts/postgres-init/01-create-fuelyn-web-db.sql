-- ============================================================
-- Web BFF (Prisma) database bootstrap.
--
-- The Next.js web BFF owns its OWN logical database, kept separate
-- from the Java backend's Flyway-managed `fuelyn` schema so the two
-- migration tools never collide on overlapping concepts (price
-- snapshots, stations, …). Prisma `db push` creates the *tables*
-- but never the database itself, so we create it here.
--
-- This file is mounted into the Postgres image's
-- /docker-entrypoint-initdb.d/ and runs exactly once, when the
-- `pgdata` volume is first initialised (empty). On an EXISTING
-- volume it does NOT re-run — recreate the DB manually, or
-- `docker compose down -v` to reinitialise, if you add this after
-- the volume already exists.
-- ============================================================

-- Postgres has no `CREATE DATABASE IF NOT EXISTS`; the gen_random_uuid
-- style guard below creates it only when absent so a re-run (e.g. a
-- second init script edit) is harmless.
SELECT 'CREATE DATABASE fuelyn_web OWNER fuelyn'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fuelyn_web')\gexec
