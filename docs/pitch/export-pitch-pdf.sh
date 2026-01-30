#!/usr/bin/env bash
# Export KeyShield pitch deck to PDF with rendered Mermaid diagrams.
# Requires: npm i -g @marp-team/marp-cli
# Run from repo root: ./docs/pitch/export-pitch-pdf.sh

set -e
cd "$(dirname "$0")/../.."

if ! command -v marp &>/dev/null; then
  echo "Marp CLI not found. Install with: npm i -g @marp-team/marp-cli"
  exit 1
fi

marp docs/pitch/PITCH_DECK.md --allow-local-files -o docs/pitch/PITCH_DECK.pdf
echo "Exported: docs/pitch/PITCH_DECK.pdf"
