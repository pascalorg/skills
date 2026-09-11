#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$1" ]; then
  echo "Usage: bash glb-audit.sh <before.glb> [after.glb]" >&2
  exit 1
fi

# Auto-install dependencies if needed
if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
  echo "Installing dependencies..." >&2
  (cd "$SCRIPT_DIR" && npm install --no-audit --no-fund --silent) >&2
fi

node "$SCRIPT_DIR/glb-audit.mjs" "$@"
