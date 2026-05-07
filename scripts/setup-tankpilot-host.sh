#!/usr/bin/env bash
# ============================================================
# Adds 127.0.0.1 entries for tankpilot.de + api.tankpilot.de to
# /etc/hosts so the dev stack is reachable at
# https://tankpilot.de:49443 instead of https://localhost:49443.
#
# This is a LOCAL OVERRIDE only — your machine resolves
# tankpilot.de to 127.0.0.1; the rest of the internet still
# reaches the real public DNS for the domain. No public-facing
# effect. Run with `--remove` to revert.
#
# Needs sudo (writes to /etc/hosts).
# ============================================================
set -euo pipefail

HOSTS=/etc/hosts
MARKER='# tankpilot-dev'
ENTRIES=(
    "127.0.0.1 tankpilot.de $MARKER"
    "127.0.0.1 api.tankpilot.de $MARKER"
)

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    sed -n '2,/^$/p' "$0" | sed 's/^# *//'
    exit 0
fi

if [[ "${1:-}" == "--remove" ]]; then
    sudo sed -i.bak "/$MARKER/d" "$HOSTS"
    echo "-> Removed tankpilot.de hosts entries."
    exit 0
fi

# Strip any existing tankpilot-dev lines, then append fresh ones.
TMP=$(mktemp)
sudo cp "$HOSTS" "$TMP"
sudo sed -i.bak "/$MARKER/d" "$HOSTS"
{
    echo ''
    echo '# --- TankPilot dev aliases (loopback) ---'
    for e in "${ENTRIES[@]}"; do echo "$e"; done
} | sudo tee -a "$HOSTS" > /dev/null

echo "-> Added entries to $HOSTS:"
for e in "${ENTRIES[@]}"; do echo "   $e"; done
echo ''
echo "Open the app at:"
echo "   https://tankpilot.de:49443"
