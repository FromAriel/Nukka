#!/bin/bash
# Installs workspace dependencies so `pnpm check` works in Claude Code cloud sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
fi

# `install` (not --frozen-lockfile) so the cached container state is reused.
pnpm install --prefer-offline
