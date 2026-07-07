#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE_DIR="${ROOT_DIR}/templates/fable5"

if [[ ! -d "${TARGET_DIR}" ]]; then
  echo "Target directory does not exist: ${TARGET_DIR}" >&2
  exit 1
fi

mkdir -p "${TARGET_DIR}/docs"
cp "${TEMPLATE_DIR}/.cursorrules" "${TARGET_DIR}/.cursorrules"
cp "${TEMPLATE_DIR}/claude.md" "${TARGET_DIR}/claude.md"
cp "${TEMPLATE_DIR}/docs/IMPLEMENTATION_PLAN_TEMPLATE.md" \
  "${TARGET_DIR}/docs/IMPLEMENTATION_PLAN_TEMPLATE.md"

cat <<'EOF'
Fable 5 workflow files installed:
- .cursorrules
- claude.md
- docs/IMPLEMENTATION_PLAN_TEMPLATE.md

Recommended kickoff prompt:
严格按照项目中的 Fable 5 Workflow Rules 和 Plan 输出模板生成 Implementation Plan。
EOF
