#!/usr/bin/env python3
"""Agent inference tests (local memory path)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "aileena_second_brain" / "agent.py"


def run(query: str) -> str:
    proc = subprocess.run(
        [sys.executable, str(AGENT), "--local-only", query],
        capture_output=True,
        text=True,
        check=True,
    )
    return proc.stdout.strip()


def main() -> int:
    cases = [
        ("her fav techno", ["DVS1", "Blawan", "hasn't written", "as her agent"]),
        ("what is in her dj set", ["Daydreaming", "Rainforest", "lovegold"]),
        ("recommend something for her taste", ["taste", "infer"]),
    ]

    for query, must_have_any in cases:
        out = run(query)
        if not any(token.lower() in out.lower() for token in must_have_any):
            print(f"FAIL: {query}\n{out}")
            return 1
        print(f"PASS: {query}")

    print(run("her fav techno"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
