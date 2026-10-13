"""Product copy and API strings stay English — no CJK anywhere in tracked files."""

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
_UI_PREFIXES = ("src/web/", "src/extension/")


def _is_cjk(ch: str) -> bool:
    return "\u4e00" <= ch <= "\u9fff" or "\u3400" <= ch <= "\u4dbf" or "\uf900" <= ch <= "\ufaff"


def _tracked_files() -> list[str]:
    return subprocess.check_output(
        ["git", "ls-files"],
        cwd=_ROOT,
        text=True,
    ).splitlines()


def _cjk_hits(rels: list[str], limit: int = 40) -> list[str]:
    hits: list[str] = []
    for rel in rels:
        path = _ROOT / rel
        if path.suffix.lower() in _SKIP_SUFFIX:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if any(_is_cjk(ch) for ch in line):
                hits.append(f"{rel}:{i}:{line.strip()[:160]}")
                if len(hits) >= limit:
                    return hits
    return hits


def test_git_tracked_source_has_no_cjk():
    hits = _cjk_hits(_tracked_files())
    assert hits == [], "CJK leftover:\n" + "\n".join(hits)


def test_ui_trees_have_no_cjk():
    ui = [
        rel
        for rel in _tracked_files()
        if rel.replace("\\", "/").startswith(_UI_PREFIXES)
    ]
    assert ui, "expected tracked UI files under src/web and src/extension"
    hits = _cjk_hits(ui)
    assert hits == [], "CJK leftover in UI:\n" + "\n".join(hits)
