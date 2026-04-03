#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_CLIENT="${TARGET_CLIENT:-all}"

if [[ "$TARGET_CLIENT" != "codex" && "$TARGET_CLIENT" != "claude" && "$TARGET_CLIENT" != "gemini" && "$TARGET_CLIENT" != "all" ]]; then
  echo "Invalid TARGET_CLIENT='$TARGET_CLIENT' (expected: codex|claude|gemini|all)" >&2
  exit 1
fi

echo "==> browser-pilot installer"
echo ""

echo "[1/2] Building..."
cd "$SCRIPT_DIR"
npm install --silent
npm run build --silent
echo "      OK: dist/"

echo "[2/2] Installing for client: $TARGET_CLIENT..."
node dist/install.js --client "$TARGET_CLIENT"
