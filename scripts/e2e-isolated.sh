#!/usr/bin/env bash
# Run Playwright specs on a private port and build folder, so parallel runs never collide.
# Usage: scripts/e2e-isolated.sh <port 4180-4299> [playwright args / spec files...]
set -euo pipefail
PORT="${1:?port}"; shift || true
E2E_PORT="$PORT" npx playwright test --reporter=line "$@"
