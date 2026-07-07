#!/usr/bin/env python3
"""Agent response tests for Aileena memory agent."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "aileena_second_brain" / "agent.py"


def run(query: str) -> str:
    proc = subprocess.run(
        [sys.executable, str(AGENT), query],
        capture_output=True,
        text=True,
        check=True,
    )
    return proc.stdout.strip()


def main() -> int:
    out = run("her fav techno")
    required = ["DVS1", "Blawan", "Rødhåd", "hasn't written", "as her agent"]
    for token in required:
        if token not in out:
            print(f"FAIL: missing '{token}' in response:\n{out}")
            return 1
    print("PASS: her fav techno")
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
