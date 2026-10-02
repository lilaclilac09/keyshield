#!/usr/bin/env bash
# Cloud Agent / CI fallback for GitNexus when the MCP namespace is absent.
# See docs/internal/GITNEXUS.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GN=(npx -y gitnexus@latest)

usage() {
  cat <<'EOF'
Usage: scripts/gitnexus-cloud.sh <command> [args...]

Commands:
  analyze          Wipe a foreign leftover index if needed, then index this repo
  impact           Blast radius (pass-through to `gitnexus impact`)
  detect-changes   Git-diff → symbols/flows (`gitnexus detect-changes`)
  query            Search execution flows
  context          360° symbol view
  status           Index status
  list             Indexed repos
  doctor           Runtime capabilities
  help             This text

Examples:
  ./scripts/gitnexus-cloud.sh analyze
  ./scripts/gitnexus-cloud.sh impact --direction upstream mint_token
  ./scripts/gitnexus-cloud.sh detect-changes --scope compare --base-ref origin/main
EOF
}

is_foreign_index() {
  [[ -f .gitnexus/meta.json ]] || return 1
  python3 - <<'PY'
import json, os, sys
p = ".gitnexus/meta.json"
try:
    meta = json.load(open(p))
except Exception:
    sys.exit(0)
indexed = os.path.realpath(meta.get("repoPath") or "")
here = os.path.realpath(os.getcwd())
sys.exit(0 if indexed and indexed != here else 1)
PY
}

# Leftover meta.json without a Ladybug DB is not a registered index.
# `gitnexus clean -f` then no-ops ("No indexed repository") and analyze
# still fails with StorageRequirementError: foreign.
needs_wipe() {
  is_foreign_index && return 0
  if [[ -f .gitnexus/meta.json && ! -e .gitnexus/lbug ]]; then
    return 0
  fi
  return 1
}

cmd_analyze() {
  if needs_wipe; then
    echo "gitnexus-cloud: removing foreign or incomplete .gitnexus/ (other host path)" >&2
    rm -rf .gitnexus
  fi
  "${GN[@]}" clean -f >/dev/null 2>&1 || true
  if needs_wipe; then
    rm -rf .gitnexus
  fi
  GITNEXUS_LBUG_EXTENSION_INSTALL=auto \
    "${GN[@]}" analyze --index-only --skip-fts --name keyshield "$@"
}

cmd="${1:-help}"
if [[ $# -gt 0 ]]; then
  shift
fi

case "$cmd" in
  analyze) cmd_analyze "$@" ;;
  impact) "${GN[@]}" impact "$@" ;;
  detect-changes|detect_changes) "${GN[@]}" detect-changes "$@" ;;
  query) "${GN[@]}" query "$@" ;;
  context) "${GN[@]}" context "$@" ;;
  status) "${GN[@]}" status "$@" ;;
  list) "${GN[@]}" list "$@" ;;
  doctor) "${GN[@]}" doctor "$@" ;;
  help|-h|--help) usage ;;
  *)
    echo "unknown command: $cmd" >&2
    usage >&2
    exit 2
    ;;
esac
