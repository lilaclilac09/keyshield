"""Product copy and API strings stay English — no CJK in tracked source."""

from __future__ import annotations

import subprocess
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[3]
_SKIP_SUFFIX = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".mp4",
    ".webm",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".ico",
    ".bin",
    ".db",
    ".sqlite",
    ".wasm",
    ".lock",
    ".pyc",
}


def _is_cjk(ch: str) -> bool:
    return "\u4e00" <= ch <= "\u9fff" or "\u3400" <= ch <= "\u4dbf" or "\uf900" <= ch <= "\ufaff"


def test_git_tracked_source_has_no_cjk():
    files = subprocess.check_output(
        ["git", "ls-files"],
        cwd=_ROOT,
        text=True,
    ).splitlines()
    hits: list[str] = []
    for rel in files:
        path = _ROOT / rel
        if path.suffix.lower() in _SKIP_SUFFIX:
            continue
        if "/_archive/" in rel.replace("\\", "/") or rel.startswith("archive/"):
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if any(_is_cjk(ch) for ch in line):
                hits.append(f"{rel}:{i}:{line.strip()[:160]}")
                if len(hits) >= 40:
                    break
        if len(hits) >= 40:
            break
    assert hits == [], "CJK leftover:\n" + "\n".join(hits)
