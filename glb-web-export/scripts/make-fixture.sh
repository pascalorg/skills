#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

OUT="${1:-before.glb}"

# Auto-install dependencies if needed
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "Installing dependencies..." >&2
  (cd "$SCRIPT_DIR" && npm install --no-audit --no-fund --silent) >&2
fi

node "$SCRIPT_DIR/make-fixture.mjs" "$OUT"
