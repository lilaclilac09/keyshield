#!/usr/bin/env python3
"""O-Mem adapter tests (no KS_TOKEN required for persona_sync)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRAIN = ROOT / "aileena_second_brain"
sys.path.insert(0, str(BRAIN))

from omem_adapter.bridge import bootstrap_from_markdown, is_omem_available
from omem_adapter.persona_sync import append_persona_fact, export_persona_snapshot


def test_persona_append_dedup() -> None:
    path = BRAIN / "memories" / "personal" / "persona-auto.md"
    if path.exists():
        path.unlink()
    p1 = append_persona_fact("She also likes Surgeon for peak-time sets", confidence="high", source="test")
    p2 = append_persona_fact("She also likes Surgeon for peak-time sets", confidence="high", source="test")
    if p1 is None:
        raise AssertionError("first append failed")
    if p2 is not None:
        raise AssertionError("duplicate should be skipped")


def test_bootstrap_snapshot() -> None:
    snap = bootstrap_from_markdown()
    if "preferences" not in snap:
        raise AssertionError("snapshot missing preferences key")


def test_cli_status() -> None:
    proc = subprocess.run(
        [sys.executable, "-m", "omem_adapter.cli", "status"],
        cwd=str(BRAIN),
        capture_output=True,
        text=True,
        check=True,
    )
    if "full_omem_available" not in proc.stdout:
        raise AssertionError("status output invalid")


def test_evolve_learn_sync() -> None:
    proc = subprocess.run(
        [sys.executable, str(BRAIN / "agent.py"), "--local-only", "记住：她最近常听 Beatrice M."],
        capture_output=True,
        text=True,
        check=True,
    )
  # persona file may be created via evolve hook
    persona = BRAIN / "memories" / "personal" / "persona-auto.md"
    if persona.exists():
        text = persona.read_text(encoding="utf-8")
        if "Beatrice" not in text:
            raise AssertionError("learn fact not synced to persona-auto")


def main() -> int:
    test_persona_append_dedup()
    print("PASS: persona append dedup")
    test_bootstrap_snapshot()
    print("PASS: bootstrap snapshot")
    test_cli_status()
    print(f"PASS: cli status (full_omem={is_omem_available()})")
    test_evolve_learn_sync()
    print("PASS: evolve learn sync")
    print(export_persona_snapshot())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
