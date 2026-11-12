#!/bin/bash
# Installs the unsigned KeyShield.app into /Applications and opens it.
# Ad-hoc signs + clears quarantine so macOS will actually launch it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/KeyShield.app"
if [[ ! -d "$APP" ]]; then
  osascript -e 'display alert "KeyShield.app was not found next to Open-KeyShield.command."' >/dev/null 2>&1 || true
  echo "KeyShield.app not found next to this script: $HERE" >&2
  exit 1
fi
DEST="/Applications/KeyShield.app"
echo "Installing KeyShield to ${DEST}..."
xattr -cr "$APP" 2>/dev/null || true
rm -rf "$DEST"
ditto "$APP" "$DEST"
xattr -cr "$DEST" 2>/dev/null || true
if command -v codesign >/dev/null 2>&1; then
  codesign --sign - --force --deep "$DEST" >/dev/null 2>&1 || true
fi
echo "Opening KeyShield..."
open "$DEST"
