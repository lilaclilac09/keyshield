#!/bin/bash
set -euo pipefail

usage() {
    printf '%s\n' 'Usage: TEAM_ID=<10-character-team-id> archive-testflight.sh [--archive-only|--upload]'
}

mode=--archive-only
if (( $# )); then mode="$1"; shift; fi
if (( $# )); then usage >&2; exit 64; fi
case "$mode" in
    --archive-only|--upload) ;;
    --help) usage; exit 0 ;;
    *) usage >&2; exit 64 ;;
esac
if [[ ! "${TEAM_ID:-}" =~ ^[A-Z0-9]{10}$ ]]; then
    printf '%s\n' 'Set TEAM_ID to your 10-character Apple Developer team ID.' >&2
    exit 64
fi

ios_dir="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
archive_path="${ARCHIVE_PATH:-$HOME/ks-testflight/KeyShield-$(date +%Y%m%d-%H%M%S).xcarchive}"
export_path="${EXPORT_PATH:-${archive_path%.xcarchive}-export}"
mkdir -p "$(dirname -- "$archive_path")"
xcodebuild archive -project "$ios_dir/KeyShield.xcodeproj" -scheme KeyShield \
    -configuration Release -destination 'generic/platform=iOS' \
    -archivePath "$archive_path" -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="$TEAM_ID" CODE_SIGN_STYLE=Automatic

if [[ "$mode" == --archive-only ]]; then
    printf 'Signed archive prepared: %s\nNo export or upload requested.\n' "$archive_path"
    exit 0
fi

umask 077
options_dir="$(mktemp -d)"
trap 'rm -rf "$options_dir"' EXIT
cp "$ios_dir/ExportOptions-TestFlight.plist" "$options_dir/ExportOptions.plist"
/usr/libexec/PlistBuddy -c "Set :teamID $TEAM_ID" "$options_dir/ExportOptions.plist"
xcodebuild -exportArchive -archivePath "$archive_path" -exportPath "$export_path" \
    -exportOptionsPlist "$options_dir/ExportOptions.plist" -allowProvisioningUpdates
