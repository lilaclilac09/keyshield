#!/usr/bin/env bash
# Stage-1 oracle-diff harness wrapper.
#
# Usage: bash proxy-rs/scripts/run_oracle_diff.sh
#
# Builds the Rust release binary, picks the right Python interpreter
# (v2-mvp/.venv if present, else $KS_PYTHON, else `python3`), and runs
# the harness. Exits 0 iff every fixture passes byte- or
# structural-equal between Python (:8001) and Rust (:8000).
#
# See `proxy-rs/tests/oracle_diff/harness.py` for the fixture list.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PROXY_RS="$REPO_ROOT/proxy-rs"
V2_MVP="$REPO_ROOT/v2-mvp"
HARNESS="$PROXY_RS/tests/oracle_diff/harness.py"

# 1. Build Rust release.
echo "[run_oracle_diff] cargo build -p ks-proxy --release"
cargo build --release \
    --manifest-path "$PROXY_RS/Cargo.toml" \
    -p ks-proxy

# 2. Pick a Python.
if [[ -x "$V2_MVP/.venv/bin/python" ]]; then
    PYTHON="$V2_MVP/.venv/bin/python"
elif [[ -n "${KS_PYTHON:-}" ]]; then
    PYTHON="$KS_PYTHON"
else
    PYTHON="$(command -v python3)"
fi
echo "[run_oracle_diff] python: $PYTHON"

# Tell the harness about the venv-python so the spawned Uvicorn picks
# the same interpreter (the harness itself runs whatever started this
# script — typically also the venv).
export KS_PYTHON="$PYTHON"

# 3. Free the ports we need (8000 Rust, 8001 Python). Ignore errors.
for port in 8000 8001; do
    if lsof -tiTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
        echo "[run_oracle_diff] killing existing listener on :$port"
        lsof -tiTCP:$port -sTCP:LISTEN | xargs -r kill -9 || true
        sleep 0.2
    fi
done

# 4. Run.
exec "$PYTHON" "$HARNESS" "$@"
