#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

echo "== Agent workflow tests =="
python3 scripts/test_agent_workflow.py

echo
echo "== DJ set HTTP smoke test =="
PORT=18088
python3 -m http.server "${PORT}" --directory dj-set >/tmp/dj-set-http.log 2>&1 &
HTTP_PID=$!
cleanup() { kill "${HTTP_PID}" 2>/dev/null || true; }
trap cleanup EXIT

sleep 1
curl -fsSL "http://127.0.0.1:${PORT}/setlist.json" -o /tmp/dj-set-test.json
python3 -c "import json; d=json.load(open('/tmp/dj-set-test.json')); assert len(d['tracks'])==5; assert d['tracks'][4]['artist']=='lovegold'; print('PASS: HTTP setlist.json reachable and lovegold verified')"

curl -fsSL "http://127.0.0.1:${PORT}/" | grep -q "DJ Set"
echo "PASS: carousel page loads"

echo
echo "Agent test complete."
