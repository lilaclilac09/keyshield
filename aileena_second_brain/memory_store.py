#!/usr/bin/env python3
"""Fast memory index — pre-split chunks, mtime invalidation, sub-ms retrieval."""

from __future__ import annotations

import json
import re
import time
from pathlib import Path

import frontmatter

ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / ".cache"
INDEX_PATH = CACHE_DIR / "memory_index.json"

MEMORY_DIRS = [
    ROOT / "memories" / "personal",
    ROOT / "memories" / "semantic",
    ROOT / "memories" / "procedural" / "skills",
    ROOT / "memories" / "episodic",
]

SKIP_NAMES = {"index.md", "_template.md", "readme.md"}


def _json_safe(value: object) -> object:
    if hasattr(value, "isoformat"):
        return value.isoformat()  # type: ignore[union-attr]
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


def _split_sections(content: str) -> list[tuple[str, str]]:
    parts = re.split(r"\n(?=## )", content.strip())
    sections: list[tuple[str, str]] = []
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if part.startswith("## "):
            title, _, body = part.partition("\n")
            sections.append((title.replace("## ", "").strip(), body.strip()))
        else:
            sections.append(("intro", part))
    return sections


def _memory_files() -> list[Path]:
    files: list[Path] = []
    for directory in MEMORY_DIRS:
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*.md")):
            if path.name.lower() in SKIP_NAMES:
                continue
            files.append(path)
    return files


def _file_signature(files: list[Path]) -> dict[str, float]:
    sig: dict[str, float] = {}
    for path in files:
        rel = str(path.relative_to(ROOT))
        try:
            sig[rel] = path.stat().st_mtime
        except OSError:
            continue
    return sig


def _build_index() -> dict:
    chunks: list[dict] = []
    for path in _memory_files():
        rel = str(path.relative_to(ROOT))
        post = frontmatter.load(path)
        metadata = _json_safe(dict(post.metadata))
        for section, body in _split_sections(post.content.strip()):
            chunks.append(
                {
                    "path": rel,
                    "section": section,
                    "content": body,
                    "metadata": metadata,
                }
            )
    return {
        "built_at": time.time(),
        "signature": _file_signature(_memory_files()),
        "chunks": chunks,
    }


class MemoryStore:
    """Singleton in-process index; rebuilds only when source files change."""

    _instance: MemoryStore | None = None

    def __init__(self) -> None:
        self._index: dict | None = None
        self._signature: dict[str, float] = {}

    @classmethod
    def get(cls) -> MemoryStore:
        if cls._instance is None:
            cls._instance = MemoryStore()
        return cls._instance

    def _load_disk_cache(self) -> dict | None:
        if not INDEX_PATH.exists():
            return None
        try:
            data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
            current = _file_signature(_memory_files())
            if data.get("signature") == current:
                return data
        except (json.JSONDecodeError, OSError):
            return None
        return None

    def _persist(self, index: dict) -> None:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")

    def refresh(self, force: bool = False) -> None:
        files = _memory_files()
        current = _file_signature(files)
        if not force and self._index and current == self._signature:
            return

        if not force:
            disk = self._load_disk_cache()
            if disk:
                self._index = disk
                self._signature = current
                return

        index = _build_index()
        self._index = index
        self._signature = current
        self._persist(index)

    def chunks(self) -> list[dict]:
        self.refresh()
        assert self._index is not None
        return self._index["chunks"]

    def stats(self) -> dict:
        self.refresh()
        assert self._index is not None
        return {
            "chunks": len(self._index["chunks"]),
            "files": len(self._signature),
            "built_at": self._index.get("built_at"),
        }

    def invalidate(self) -> None:
        self._index = None
        self._signature = {}
        if INDEX_PATH.exists():
            INDEX_PATH.unlink(missing_ok=True)
