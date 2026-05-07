#!/usr/bin/env bash
# ============================================================
# Lightweight pre-commit hook — fast lint + type-check.
# Install: ln -sf ../../scripts/pre-commit.sh .git/hooks/pre-commit
# ============================================================
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

CHANGED_TS=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx)$' || true)
CHANGED_JAVA=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.java$' || true)

if [[ -n "$CHANGED_TS" ]]; then
  echo "[pre-commit] ESLint on changed TS/TSX files..."
  echo "$CHANGED_TS" | xargs npx eslint --max-warnings=0
fi

if [[ -n "$CHANGED_JAVA" ]]; then
  echo "[pre-commit] Spotless check..."
  ( cd backend && mvn -B -ntp spotless:check )
fi

echo "[pre-commit] OK"
