#!/bin/bash
set -euo pipefail

# Only run in remote (Claude Code on the web) environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

CRON_DIR="$(dirname "$CLAUDE_PROJECT_DIR")/xadrez-br-cron"

echo "==> Installing xadrez-br dependencies..."
cd "$CLAUDE_PROJECT_DIR"
npm install

echo "==> Cloning xadrez-br-cron..."
if [ ! -d "$CRON_DIR" ]; then
  git clone https://github.com/Guigomes/xadrez-br-cron.git "$CRON_DIR"
else
  echo "    xadrez-br-cron already present, pulling latest..."
  git -C "$CRON_DIR" pull --ff-only
fi

echo "==> Installing xadrez-br-cron dependencies..."
cd "$CRON_DIR"
npm install

echo "==> Session start complete."
