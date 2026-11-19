#!/bin/bash
# Installs the unsigned KeyShield.app into /Applications and opens it.
# Clears macOS quarantine so Gatekeeper lets the unsigned app launch.
# No code signing: once quarantine is gone, an unsigned app opens fine,
# and ad-hoc signing with --deep is known to break Electron bundles.
#
# How to run this file: RIGHT-CLICK it in Finder and choose Open.
# A plain double-click is refused for scripts that came out of a
# downloaded zip/DMG ("unidentified developer"); right-click → Open
# shows the Open button. Or run it from Terminal:
#   bash Open-KeyShield.command
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/KeyShield.app"
if [[ ! -d "$APP" ]]; then
  osascript -e 'display alert "KeyShield.app was not found next to Open-KeyShield.command."' >/dev/null 2>&1 || true
  echo "KeyShield.app not found next to this script: $HERE" >&2
  exit 1
fi
DEST="/Applications/KeyShield.app"
echo "Clearing quarantine on $APP ..."
xattr -cr "$APP" 2>/dev/null || true
echo "Installing KeyShield to ${DEST}..."
rm -rf "$DEST"
ditto "$APP" "$DEST"
xattr -cr "$DEST" 2>/dev/null || true
echo "Opening KeyShield..."
open "$DEST"
echo "Done. If the app still does not open, see BUILD-INFO.txt next to this script"
echo "and the launch log at ~/Library/Logs/KeyShield/keyshield-desktop.log"
