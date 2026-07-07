#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
FABLE5_TEMPLATE_DIR="${ROOT_DIR}/templates/fable5"
SECOND_BRAIN_SOURCE_DIR="${ROOT_DIR}/aileena_second_brain"
MEMORY_BOOTSTRAP_SOURCE="${ROOT_DIR}/docs/CURSOR_MEMORY_BOOTSTRAP.md"

if [[ ! -d "${TARGET_DIR}" ]]; then
  echo "Target directory does not exist: ${TARGET_DIR}" >&2
  exit 1
fi

mkdir -p "${TARGET_DIR}/docs"
cp "${FABLE5_TEMPLATE_DIR}/.cursorrules" "${TARGET_DIR}/.cursorrules"
cp "${FABLE5_TEMPLATE_DIR}/claude.md" "${TARGET_DIR}/claude.md"
cp "${FABLE5_TEMPLATE_DIR}/docs/IMPLEMENTATION_PLAN_TEMPLATE.md" \
  "${TARGET_DIR}/docs/IMPLEMENTATION_PLAN_TEMPLATE.md"

if [[ -f "${MEMORY_BOOTSTRAP_SOURCE}" ]]; then
  cp "${MEMORY_BOOTSTRAP_SOURCE}" "${TARGET_DIR}/docs/CURSOR_MEMORY_BOOTSTRAP.md"
fi

if [[ -d "${SECOND_BRAIN_SOURCE_DIR}" ]]; then
  rm -rf "${TARGET_DIR}/aileena_second_brain"
  mkdir -p "${TARGET_DIR}/aileena_second_brain"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a \
      --exclude ".git" \
      --exclude "__pycache__" \
      --exclude "training_data/skills.jsonl" \
      --exclude "output_lora_skills" \
      "${SECOND_BRAIN_SOURCE_DIR}/" "${TARGET_DIR}/aileena_second_brain/"
  else
    cp -R "${SECOND_BRAIN_SOURCE_DIR}/." "${TARGET_DIR}/aileena_second_brain/"
    rm -f "${TARGET_DIR}/aileena_second_brain/training_data/skills.jsonl"
    rm -rf "${TARGET_DIR}/aileena_second_brain/output_lora_skills"
    find "${TARGET_DIR}/aileena_second_brain" -type d -name "__pycache__" -prune -exec rm -rf {} +
  fi
fi

cat <<'EOF'
Installed workflow stack:

Fable 5:
- .cursorrules
- claude.md
- docs/IMPLEMENTATION_PLAN_TEMPLATE.md
- docs/CURSOR_MEMORY_BOOTSTRAP.md (if available)

Aileena Second Brain:
- aileena_second_brain/SYSTEM_PROMPT.md
- aileena_second_brain/memories/**
- aileena_second_brain/consolidate.py
- aileena_second_brain/prepare_lora_data.py

Recommended kickoff prompt:
严格按照项目中的 Fable 5 Workflow Rules 和 Plan 输出模板生成 Implementation Plan。

Optional one-time setup:
1) Add account memories from docs/CURSOR_MEMORY_BOOTSTRAP.md
2) Copy aileena_second_brain/SYSTEM_PROMPT.md into agent system instructions
EOF
