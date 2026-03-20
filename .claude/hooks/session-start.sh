#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

echo "Installing pnpm via corepack..."
corepack enable
corepack prepare pnpm@9.15.0 --activate

echo "Installing dependencies..."
pnpm install --frozen-lockfile

echo "Building packages..."
pnpm build

echo "Session startup complete."
