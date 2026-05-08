#!/usr/bin/env bash
# Build the KeyShield extension for Firefox (Manifest V2).
# Produces output in frontend/dist-firefox/.
#
# Usage:
#   ./scripts/build-firefox.sh
#   # or from frontend/:
#   npm run build:firefox
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/../frontend"

MANIFEST_ORIG="$FRONTEND_DIR/manifest.json"
MANIFEST_FF="$FRONTEND_DIR/manifest.firefox.json"
MANIFEST_BAK="$FRONTEND_DIR/manifest.json.bak"

if [[ ! -f "$MANIFEST_FF" ]]; then
  echo "ERROR: $MANIFEST_FF not found." >&2
  exit 1
fi

# Restore original manifest on exit (even if build fails)
restore() {
  if [[ -f "$MANIFEST_BAK" ]]; then
    mv "$MANIFEST_BAK" "$MANIFEST_ORIG"
  fi
}
trap restore EXIT

# Swap in Firefox manifest
cp "$MANIFEST_ORIG" "$MANIFEST_BAK"
cp "$MANIFEST_FF" "$MANIFEST_ORIG"

echo "Building Firefox MV2 extension..."
cd "$FRONTEND_DIR"
npx vite build --outDir dist-firefox

echo ""
echo "Firefox build complete: frontend/dist-firefox/"
echo "Load it in Firefox via about:debugging -> Load Temporary Add-on -> dist-firefox/manifest.json"
