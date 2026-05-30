#!/usr/bin/env bash
# ============================================================
# Generate a working .env file for local docker-compose.
#
# - Generates 32-byte hex secrets for HMAC + API keys + cron
# - Refuses to overwrite an existing .env (use `--force` to override)
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"
FORCE=${1:-}

if [[ -f "$ENV_FILE" && "$FORCE" != "--force" ]]; then
  echo "[!] $ENV_FILE already exists. Use '--force' to overwrite." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "[!] openssl is required" >&2
  exit 1
fi

HMAC_SECRET="$(openssl rand -hex 32)"
API_KEY_1="$(openssl rand -hex 32)"
CRON_SECRET="$(openssl rand -hex 32)"
POSTGRES_PASSWORD="$(openssl rand -hex 16)"

# Web (Next.js BFF) secrets. FUELYN_JWT_SECRET is REQUIRED by
# docker-compose.yml (the web service uses ${FUELYN_JWT_SECRET:?}),
# so the stack won't start without it. FUELYN_ADMIN_TOKEN gates the
# moderation queue (/api/admin/*); without it those endpoints
# fail closed (403).
FUELYN_JWT_SECRET="$(openssl rand -hex 32)"
FUELYN_ADMIN_TOKEN="$(openssl rand -hex 32)"

cat > "$ENV_FILE" <<EOF
# Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ") by scripts/generate-dev-secrets.sh
# DO NOT COMMIT. Already in .gitignore.

POSTGRES_PASSWORD=$POSTGRES_PASSWORD

HMAC_SECRET=$HMAC_SECRET
API_KEY_1=$API_KEY_1
CRON_SECRET=$CRON_SECRET

# Web (Next.js BFF) secrets
FUELYN_JWT_SECRET=$FUELYN_JWT_SECRET
FUELYN_ADMIN_TOKEN=$FUELYN_ADMIN_TOKEN

# External APIs (fill in real values)
TANKERKOENIG_API_KEY=
OPENCHARGEMAP_API_KEY=
OPENAI_API_KEY=
EOF

echo "[+] Wrote $ENV_FILE"
echo "[+] Fill in TANKERKOENIG_API_KEY, OPENCHARGEMAP_API_KEY and OPENAI_API_KEY before starting docker-compose."
