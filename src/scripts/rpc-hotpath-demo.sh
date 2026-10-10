#!/usr/bin/env bash
# Screen Studio: left terminal, right /talk or /demo status strip.
# Real ks-helius: 20 concurrent getBalance → 1 mock fire, then moka HIT.
# Does not claim redb or LaserStream.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/src/proxy"
cargo test -p ks-helius hotpath_prints_miss_single_flight_then_moka_hit -- --nocapture
