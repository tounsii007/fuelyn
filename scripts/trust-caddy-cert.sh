#!/usr/bin/env bash
# ============================================================
# Trust the Caddy internal-CA root certificate on this machine
# so that browsers stop warning about https://localhost.
#
# Usage:
#   ./scripts/trust-caddy-cert.sh
#
# Detects host OS (macOS / Linux / Windows-Git-Bash) and dispatches
# to the matching trust-store update.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_OUT="$ROOT/.caddy-root.crt"

if ! docker compose ps --quiet caddy >/dev/null 2>&1 || \
   [[ -z "$(docker compose ps --quiet caddy 2>/dev/null)" ]]; then
  echo "[!] Caddy container is not running. Start the stack first:" >&2
  echo "    docker compose up -d caddy" >&2
  exit 1
fi

echo "[+] Extracting Caddy root CA …"
docker compose exec -T caddy cat /data/caddy/pki/authorities/local/root.crt > "$CERT_OUT"

if [[ ! -s "$CERT_OUT" ]]; then
  echo "[!] Failed to read root.crt from the caddy container." >&2
  exit 1
fi

OS_NAME="$(uname -s 2>/dev/null || echo unknown)"
case "$OS_NAME" in
  Darwin*)
    echo "[+] macOS detected — adding to System keychain (sudo will prompt)…"
    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "$CERT_OUT"
    echo "[+] Done. Restart your browser to pick up the new root."
    ;;
  Linux*)
    echo "[+] Linux detected — copying to /usr/local/share/ca-certificates/ (sudo will prompt)…"
    sudo cp "$CERT_OUT" /usr/local/share/ca-certificates/caddy-fuelyn-root.crt
    sudo update-ca-certificates
    echo "[+] System trust store updated. For Firefox, add via Preferences → Privacy → Certificates."
    ;;
  MINGW*|MSYS*|CYGWIN*)
    echo "[+] Windows (Git Bash) detected."
    echo ""
    echo "    Run the following in an *Administrator* PowerShell once:"
    echo ""
    echo "      Import-Certificate -FilePath '$CERT_OUT' \\"
    echo "        -CertStoreLocation Cert:\\LocalMachine\\Root"
    echo ""
    echo "    Then restart your browser. Chromium browsers use this store;"
    echo "    Firefox needs a separate import via about:preferences#privacy."
    ;;
  *)
    echo "[!] Unknown OS '$OS_NAME'. The cert is at: $CERT_OUT"
    echo "    Import it manually into your OS / browser trust store."
    ;;
esac
