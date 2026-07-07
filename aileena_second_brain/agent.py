#!/usr/bin/env python3
"""Aileena memory agent — answer from external memory files (ReMeLight style)."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import frontmatter

ROOT = Path(__file__).resolve().parent
MEMORY_DIRS = [
    ROOT / "memories" / "personal",
    ROOT / "memories" / "semantic",
    ROOT / "memories" / "procedural" / "skills",
]


def load_memories() -> list[dict]:
    rows: list[dict] = []
    for directory in MEMORY_DIRS:
        if not directory.exists():
            continue
        for path in sorted(directory.rglob("*.md")):
            if path.name.lower() in {"index.md", "_template.md", "readme.md"}:
                continue
            post = frontmatter.load(path)
            rows.append(
                {
                    "path": str(path.relative_to(ROOT)),
                    "metadata": dict(post.metadata),
                    "content": post.content.strip(),
                    "text": f"{path.name}\n{post.content}",
                }
            )
    return rows


def tokenize(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9øåäöü]+", text.lower()) if len(t) > 2}


def score_memory(query: str, memory: dict) -> int:
    q = tokenize(query)
    hay = tokenize(memory["text"] + " " + str(memory["metadata"]))
    overlap = len(q & hay)
    bonus = 0
    ql = query.lower()
    if any(k in ql for k in ("techno", "fav", "favorite", "favourite", "dj", "set", "music", "taste")):
        if "music-taste" in memory["path"] or "dj-set" in memory["path"]:
            bonus += 5
    if "techno" in ql and "techno" in memory["text"].lower():
        bonus += 8
    return overlap + bonus


def pick_memories(query: str, limit: int = 3) -> list[dict]:
    ranked = sorted(load_memories(), key=lambda m: score_memory(query, m), reverse=True)
    return [m for m in ranked if score_memory(query, m) > 0][:limit]


def answer_techno_fav() -> str:
    return (
        "She hasn't written about her favourite techno music directly. "
        "From what I know personally (as her agent), she's into harder, driving techno — "
        "artists like DVS1, Blawan, and Rødhåd — but that's not something she's published about."
    )


def answer_dj_set() -> str:
    return (
        "Current DJ set carousel tracks: Daydreaming (Harry Styles), Rainforest + High Tide "
        "(John Beltran / Open House — Now & Then), In Touch Feat. Jinnal & Kaba "
        "(Beatrice M. — Sinking Plate 3), and Rendezvous (lovegold). "
        "See dj-set/setlist.json for covers and links."
    )


def synthesize(query: str, memories: list[dict]) -> str:
    ql = query.lower()
    if re.search(r"favou?rite|fav", ql) and "techno" in ql:
        return answer_techno_fav()
    if "dj set" in ql or "carousel" in ql:
        return answer_dj_set()

    if not memories:
        return "I don't have enough memory context for that yet. Try asking about her techno taste or DJ set."

    lines = ["From memory (as her agent):"]
    for mem in memories:
        title = mem["metadata"].get("title") or Path(mem["path"]).stem
        snippet = mem["content"].split("\n", 1)[0][:180]
        lines.append(f"- {title}: {snippet}")
    lines.append("Note: personal memory may include unpublished preferences.")
    return "\n".join(lines)


def repl() -> int:
    print("Aileena memory agent. Type a question, or 'exit'.")
    while True:
        try:
            query = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return 0
        if not query:
            continue
        if query.lower() in {"exit", "quit", "q"}:
            return 0
        memories = pick_memories(query)
        print(synthesize(query, memories))
        print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Query Aileena external memory agent")
    parser.add_argument("query", nargs="*", help="Question to ask")
    args = parser.parse_args()

    if args.query:
        q = " ".join(args.query)
        print(synthesize(q, pick_memories(q)))
        return 0
    return repl()


if __name__ == "__main__":
    raise SystemExit(main())
