#!/usr/bin/env bash
# build-safari.sh — Package the KeyShield Chrome extension as a Safari Web Extension.
#
# Usage (from repo root):   bash scripts/build-safari.sh
# Usage (from frontend/):   npm run build:safari
#
# Prerequisites:
#   - macOS with Xcode installed (download from https://developer.apple.com/xcode/)
#   - Xcode Command Line Tools: xcode-select --install
#   - An active Apple Developer account to sign and distribute the app

set -euo pipefail

# ---------------------------------------------------------------------------
# Resolve paths relative to this script's location so it works from anywhere.
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FRONTEND_DIR="${REPO_ROOT}/frontend"
DIST_DIR="${FRONTEND_DIR}/dist"
SAFARI_OUT="${REPO_ROOT}/safari-extension"

# ---------------------------------------------------------------------------
# 1. Preflight: verify Xcode CLI tools are present.
# ---------------------------------------------------------------------------
echo "==> Checking for Xcode Command Line Tools..."
if ! xcrun --find safari-web-extension-converter &>/dev/null; then
  echo ""
  echo "ERROR: 'xcrun safari-web-extension-converter' not found."
  echo ""
  echo "  Fix options:"
  echo "    1. Install Xcode from https://developer.apple.com/xcode/"
  echo "       (the full Xcode app, NOT just the CLI tools, is required)"
  echo "    2. After installation, run:  sudo xcode-select -s /Applications/Xcode.app"
  echo "    3. Accept the license:       sudo xcodebuild -license accept"
  echo ""
  exit 1
fi
echo "    OK — $(xcrun --find safari-web-extension-converter)"

# ---------------------------------------------------------------------------
# 2. Build the Chrome/MV3 extension.
# ---------------------------------------------------------------------------
echo ""
echo "==> Building frontend with Vite..."
cd "${FRONTEND_DIR}"
npm run build
echo "    Build complete — output: ${DIST_DIR}"

# ---------------------------------------------------------------------------
# 3. Run the Safari Web Extension converter.
#    --no-open   : do not auto-open Xcode (let the user choose when to open it)
#    --force     : overwrite existing safari-extension/ directory (idempotent)
# ---------------------------------------------------------------------------
echo ""
echo "==> Converting Chrome extension to Safari Web Extension..."
echo "    Source : ${DIST_DIR}"
echo "    Output : ${SAFARI_OUT}"
echo ""

xcrun safari-web-extension-converter \
  "${DIST_DIR}" \
  --project-location "${REPO_ROOT}" \
  --app-name "KeyShield" \
  --bundle-identifier "com.keyshield.extension" \
  --no-open \
  --force

# ---------------------------------------------------------------------------
# 4. Print next steps.
# ---------------------------------------------------------------------------
echo ""
echo "========================================================="
echo "  Safari Web Extension project created successfully!"
echo "========================================================="
echo ""
echo "  Project location: ${SAFARI_OUT}/"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Open the project in Xcode:"
echo "       open '${SAFARI_OUT}/KeyShield/KeyShield.xcodeproj'"
echo ""
echo "  2. In Xcode:"
echo "       a. Select your Apple Developer Team in the Signing & Capabilities"
echo "          tab for BOTH targets (the app and the extension)."
echo "       b. Set the deployment target to macOS 14 / iOS 17 or later"
echo "          (safari-web-extension-converter requires Xcode 15+)."
echo "       c. Build and run on a simulator or device to test."
echo ""
echo "  3. To distribute on the App Store:"
echo "       a. Product → Archive"
echo "       b. Distribute App → App Store Connect"
echo ""
echo "  4. Enable the extension in Safari:"
echo "       Safari → Settings → Extensions → KeyShield → Enable"
echo ""
echo "  Tip: Re-run this script any time the frontend/ code changes."
echo "       It is idempotent — the --force flag overwrites the previous output."
echo ""
