#!/usr/bin/env bash
# build-safari.sh — Convert src/extension into a Safari Web Extension wrapper.
#
# Usage (from repo root):
#   bash src/scripts/build-safari.sh
#   npm run extension:build-safari
#
# Optional env vars:
#   SAFARI_APP_NAME=KeyShield
#   SAFARI_BUNDLE_ID=xyz.aileena.keyshield
#   SAFARI_PROJECT_ROOT=/absolute/path/for/generated/project

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
EXT_DIR="${REPO_ROOT}/src/extension"
SAFARI_APP_NAME="${SAFARI_APP_NAME:-KeyShield}"
SAFARI_BUNDLE_ID="${SAFARI_BUNDLE_ID:-xyz.aileena.keyshield}"
SAFARI_PROJECT_ROOT="${SAFARI_PROJECT_ROOT:-${REPO_ROOT}/src/extension/safari-wrapper}"

if [[ ! -f "${EXT_DIR}/manifest.json" ]]; then
  echo "ERROR: missing ${EXT_DIR}/manifest.json"
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "ERROR: Safari packaging requires macOS + Xcode."
  echo "Run this script on your Mac checkout."
  exit 1
fi

echo "==> Checking Safari converter..."
if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo ""
  echo "ERROR: safari-web-extension-converter not found."
  echo "Install Xcode, then run:"
  echo "  sudo xcode-select -s /Applications/Xcode.app"
  echo "  sudo xcodebuild -license accept"
  echo ""
  exit 1
fi
echo "    OK — $(xcrun --find safari-web-extension-converter)"

mkdir -p "${SAFARI_PROJECT_ROOT}"

echo ""
echo "==> Converting extension..."
echo "    Source : ${EXT_DIR}"
echo "    Output : ${SAFARI_PROJECT_ROOT}"
echo "    App    : ${SAFARI_APP_NAME}"
echo "    Bundle : ${SAFARI_BUNDLE_ID}"
echo ""

xcrun safari-web-extension-converter \
  "${EXT_DIR}" \
  --project-location "${SAFARI_PROJECT_ROOT}" \
  --app-name "${SAFARI_APP_NAME}" \
  --bundle-identifier "${SAFARI_BUNDLE_ID}" \
  --copy-resources \
  --no-open \
  --force

XCODEPROJ="${SAFARI_PROJECT_ROOT}/${SAFARI_APP_NAME}/${SAFARI_APP_NAME}.xcodeproj"

echo ""
echo "========================================================="
echo " Safari wrapper generated"
echo "========================================================="
echo ""
echo "Project: ${XCODEPROJ}"
echo ""
echo "Next steps:"
echo "  1. open '${XCODEPROJ}'"
echo "  2. In Xcode, set Signing Team for BOTH targets"
echo "  3. Build and Run the app target"
echo "  4. Safari → Settings → Extensions → enable '${SAFARI_APP_NAME}'"
echo ""
echo "Tip: rerun this script after changing files in src/extension/."
