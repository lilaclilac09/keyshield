#!/usr/bin/env python3
"""Agent workflow smoke tests: DJ set + memory + training pipeline."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DJ_SET = REPO / "dj-set" / "setlist.json"
BRAIN = REPO / "aileena_second_brain"

REQUIRED_TRACKS = [
    ("Daydreaming", "Harry Styles"),
    ("Rainforest", "John Beltran / Open House"),
    ("High Tide", "John Beltran / Open House"),
    ("In Touch Feat. Jinnal & Kaba", "Beatrice M."),
    ("Rendezvous (Original Mix)", "lovegold"),
]

REQUIRED_MEMORY_FILES = [
    BRAIN / "memories/personal/music-taste.md",
    BRAIN / "memories/semantic/dj-set-tracks.md",
    BRAIN / "memories/semantic/architecture-strategy.md",
    BRAIN / "memories/semantic/data-slicing-strategy.md",
    BRAIN / "memories/procedural/skills/curate-dj-set-carousel.md",
]


def ok(msg: str) -> None:
    print(f"PASS: {msg}")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    raise AssertionError(msg)


def test_dj_set_tracks() -> None:
    data = json.loads(DJ_SET.read_text(encoding="utf-8"))
    tracks = data.get("tracks", [])
    if len(tracks) != 5:
        fail(f"expected 5 tracks, got {len(tracks)}")

    for i, (title, artist) in enumerate(REQUIRED_TRACKS, start=1):
        t = tracks[i - 1]
        if t.get("title") != title:
            fail(f"track {i} title mismatch: {t.get('title')} != {title}")
        if t.get("artist") != artist:
            fail(f"track {i} artist mismatch: {t.get('artist')} != {artist}")
        if not t.get("cover"):
            fail(f"track {i} missing cover")
        if not t.get("track_id"):
            fail(f"track {i} missing track_id")

    ok("dj-set/setlist.json has 5 tracks with correct titles/artists/covers")


def test_memory_files() -> None:
    for path in REQUIRED_MEMORY_FILES:
        if not path.exists():
            fail(f"missing memory file: {path}")
        if path.stat().st_size < 50:
            fail(f"memory file too small: {path}")
    ok("music taste + strategy memory files exist")


def test_training_pipeline() -> None:
    proc = subprocess.run(
        [sys.executable, "prepare_training_data.py"],
        cwd=BRAIN,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        fail(f"prepare_training_data.py failed:\n{proc.stderr}")

    stats_path = BRAIN / "training_data" / "text_all.jsonl"
    music_path = BRAIN / "training_data" / "music.jsonl"
    if not stats_path.exists() or not music_path.exists():
        fail("training outputs missing")

    total = sum(1 for _ in stats_path.open(encoding="utf-8"))
    music = sum(1 for _ in music_path.open(encoding="utf-8"))
    if music != 5:
        fail(f"expected 5 music samples, got {music}")
    if total < 40:
        fail(f"expected >= 40 total samples, got {total}")

    ok(f"training pipeline generated total={total}, music={music}")


def test_consolidate() -> None:
    proc = subprocess.run(
        [sys.executable, "consolidate.py"],
        cwd=BRAIN,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        fail(f"consolidate.py failed:\n{proc.stderr}")
    ok("consolidate.py runs successfully")


def test_dj_set_assets() -> None:
    data = json.loads(DJ_SET.read_text(encoding="utf-8"))
    for track in data["tracks"]:
        cover = REPO / "dj-set" / track["cover"]
        if not cover.exists():
            fail(f"cover missing: {cover}")
    ok("all dj-set cover assets exist")


def main() -> int:
    print("=== Agent Workflow Test ===")
    tests = [
        test_dj_set_tracks,
        test_memory_files,
        test_dj_set_assets,
        test_training_pipeline,
        test_consolidate,
    ]

    passed = 0
    for test in tests:
        test()
        passed += 1

    print(f"\nAll agent tests passed ({passed}/{len(tests)})")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(f"\nAgent test failed: {exc}")
        raise SystemExit(1)
