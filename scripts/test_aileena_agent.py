#!/usr/bin/env python3
"""Tests for fast index, context memory, and evolution hooks."""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "aileena_second_brain" / "agent.py"
sys.path.insert(0, str(ROOT / "aileena_second_brain"))

from context_memory import ContextMemory  # noqa: E402
from memory_store import MemoryStore  # noqa: E402


def run(query: str, *extra: str) -> str:
    cmd = [sys.executable, str(AGENT), "--local-only", "--no-evolve", *extra, query]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return proc.stdout.strip()


def test_retrieval_speed() -> None:
    store = MemoryStore.get()
    store.refresh(force=True)
    t0 = time.perf_counter()
    for _ in range(50):
        store.chunks()
    elapsed_ms = (time.perf_counter() - t0) * 1000
    if elapsed_ms > 200:
        raise AssertionError(f"index too slow: {elapsed_ms:.1f}ms for 50 reads")


def test_context_follow_up() -> None:
    ctx = ContextMemory()
    ctx.clear()
    run("her fav techno")
    run("what about her dj set")
    ctx = ContextMemory()
    if not ctx.state.turns:
        raise AssertionError("context turns not persisted")
    topics = set(ctx.state.active_topics)
    if not (topics & {"techno", "dj_set"}):
        raise AssertionError(f"expected techno/dj_set in context, got {topics}")


def test_inference_cases() -> None:
    cases = [
        ("her fav techno", ["DVS1", "Blawan", "hasn't written", "as her agent"]),
        ("what is in her dj set", ["Daydreaming", "Rainforest", "lovegold"]),
        ("recommend something for her taste", ["taste", "infer"]),
        ("记忆系统怎么自进化", ["episodic", "context", "index"]),
    ]
    for query, must_have_any in cases:
        out = run(query)
        if not any(token.lower() in out.lower() for token in must_have_any):
            raise AssertionError(f"FAIL: {query}\n{out}")


def main() -> int:
    test_retrieval_speed()
    print("PASS: retrieval speed")
    test_context_follow_up()
    print("PASS: context memory")
    test_inference_cases()
    print("PASS: inference cases")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
