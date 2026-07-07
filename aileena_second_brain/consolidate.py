#!/usr/bin/env python3
"""Coordinator Dreaming: consolidate episodic memories into semantic/skills and archive."""

from __future__ import annotations

import shutil
from datetime import date, datetime, timedelta
from pathlib import Path

import frontmatter

ROOT = Path(__file__).resolve().parent
MEMORIES = ROOT / "memories"

EPISODIC_DIR = MEMORIES / "episodic"
SEMANTIC_DIR = MEMORIES / "semantic"
SKILLS_DIR = MEMORIES / "procedural" / "skills"
ARCHIVED_DIR = MEMORIES / "archived"

DECAY_DAYS = {
    "fast": 7,
    "medium": 30,
    "slow": 180,
}


def _parse_date(value: object) -> date | None:
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            return None
    return None


def should_archive(metadata: dict) -> bool:
    """Archive memories past their decay window with low confidence."""
    decay_speed = str(metadata.get("decay_speed", "medium")).lower()
    confidence = str(metadata.get("confidence", "medium")).lower()
    created = _parse_date(metadata.get("date"))

    if confidence == "high" and decay_speed == "slow":
        return False
    if created is None:
        return False

    ttl = DECAY_DAYS.get(decay_speed, DECAY_DAYS["medium"])
    return date.today() - created > timedelta(days=ttl)


def archive_file(path: Path) -> Path:
    """Move a memory file into archived/ preserving relative path."""
    rel = path.relative_to(MEMORIES)
    target = ARCHIVED_DIR / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(path), str(target))
    return target


def consolidate_episodic_to_semantic(path: Path) -> Path | None:
    """Promote high-confidence episodic notes into semantic facts."""
    post = frontmatter.load(path)
    metadata = dict(post.metadata)

    if metadata.get("type") != "experience":
        return None
    if str(metadata.get("confidence", "")).lower() != "high":
        return None

    slug = path.stem
    target = SEMANTIC_DIR / f"{slug}.md"
    if target.exists():
        return None

    metadata["type"] = "fact"
    metadata["source"] = metadata.get("source", path.name)
    metadata["date"] = date.today().isoformat()
    post.metadata = metadata

    target.write_text(frontmatter.dumps(post), encoding="utf-8")
    archive_file(path)
    return target


def run_consolidation() -> dict[str, int]:
    """Scan episodic memories, archive decayed files, promote high-value facts."""
    archived = 0
    promoted = 0

    for path in sorted(episodic_paths()):
        post = frontmatter.load(path)
        metadata = dict(post.metadata)

        promoted_path = consolidate_episodic_to_semantic(path)
        if promoted_path:
            promoted += 1
            print(f"promoted: {path.name} -> {promoted_path}")
            continue

        if should_archive(metadata):
            target = archive_file(path)
            archived += 1
            print(f"archived: {path.name} -> {target}")

    return {"archived": archived, "promoted": promoted}


def episodic_paths() -> list[Path]:
    return [p for p in EPISODIC_DIR.rglob("*.md") if p.is_file()]


if __name__ == "__main__":
    stats = run_consolidation()
    print(f"Consolidation complete: {stats}")
