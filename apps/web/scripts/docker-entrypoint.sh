#!/bin/sh
# ============================================================
# Fuelyn web container entrypoint.
#
# Seeds the runtime SQLite DB from a build-time template once,
# then execs the real Next.js standalone server. Idempotent —
# re-running on a populated volume is a no-op.
# ============================================================
set -e

DB_FILE="${DATABASE_URL#file:}"
DB_DIR="$(dirname "$DB_FILE")"
TEMPLATE="/app/apps/web/prisma/web.db.template"

mkdir -p "$DB_DIR" 2>/dev/null || true

if [ ! -f "$DB_FILE" ]; then
  if [ -f "$TEMPLATE" ]; then
    echo "[entrypoint] First boot — seeding $DB_FILE from template"
    cp "$TEMPLATE" "$DB_FILE"
  else
    echo "[entrypoint] WARNING: no template at $TEMPLATE — DB-dependent routes will 500"
  fi
else
  echo "[entrypoint] $DB_FILE already exists — skipping seed"
fi

echo "[entrypoint] Starting Next.js server"
exec "$@"
