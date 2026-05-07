#!/usr/bin/env bash
# ============================================================
# Generate a working .env file for local docker-compose.
#
# - Creates an RSA 2048 keypair for JWT (RS256)
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

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

openssl genpkey -algorithm RSA -out "$TMP/private.pem" -pkeyopt rsa_keygen_bits:2048 >/dev/null 2>&1
openssl rsa -in "$TMP/private.pem" -pubout -out "$TMP/public.pem" >/dev/null 2>&1

JWT_PRIVATE_KEY="$(awk '{printf "%s\\n", $0}' "$TMP/private.pem")"
JWT_PUBLIC_KEY="$(awk '{printf "%s\\n", $0}' "$TMP/public.pem")"

HMAC_SECRET="$(openssl rand -hex 32)"
API_KEY_1="$(openssl rand -hex 32)"
CRON_SECRET="$(openssl rand -hex 32)"
POSTGRES_PASSWORD="$(openssl rand -hex 16)"

cat > "$ENV_FILE" <<EOF
# Generated $(date -u +"%Y-%m-%dT%H:%M:%SZ") by scripts/generate-dev-secrets.sh
# DO NOT COMMIT. Already in .gitignore.

POSTGRES_PASSWORD=$POSTGRES_PASSWORD

HMAC_SECRET=$HMAC_SECRET
API_KEY_1=$API_KEY_1
CRON_SECRET=$CRON_SECRET

# RS256 keypair (PEM, newlines escaped as \\n for env transport)
JWT_PUBLIC_KEY="$JWT_PUBLIC_KEY"
JWT_PRIVATE_KEY="$JWT_PRIVATE_KEY"

# External APIs (fill in real values)
TANKERKOENIG_API_KEY=
OPENCHARGEMAP_API_KEY=
OPENAI_API_KEY=
EOF

echo "[+] Wrote $ENV_FILE"
echo "[+] Fill in TANKERKOENIG_API_KEY, OPENCHARGEMAP_API_KEY and OPENAI_API_KEY before starting docker-compose."
