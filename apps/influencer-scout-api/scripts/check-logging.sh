#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if rg -n "console\\." src -g '!src/utils/logger.ts'; then
  echo "\nERROR: console.* usage found in pipeline-service src/ (use utils/logger instead)." >&2
  exit 1
fi

echo "Pipeline-service logging check passed."
