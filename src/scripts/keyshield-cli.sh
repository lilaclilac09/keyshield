#!/usr/bin/env bash
# Wrapper so docs that say `src/scripts/keyshield-cli.sh` still work.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/src/backend/keyshield-cli.sh"
