#!/usr/bin/env python3
"""Aileena memory agent — retrieve, infer, and answer from external memory."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path

import frontmatter

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
DJ_SET_PATH = REPO_ROOT / "dj-set" / "setlist.json"
MEMORY_DIRS = [
    ROOT / "memories" / "personal",
    ROOT / "memories" / "semantic",
    ROOT / "memories" / "procedural" / "skills",
]

SYNONYMS = {
    "fav": {"fav", "favorite", "favourite", "like", "loves", "into"},
    "techno": {"techno", "electronic", "club", "rave"},
    "dj": {"dj", "set", "carousel", "playlist", "crate"},
    "taste": {"taste", "style", "preference", "into", "vibe"},
}

UNPUBLISHED_MARKERS = (
    "没有在公开",
    "not something she's published",
    "not published",
    "personal agent knowledge",
    "我个人所知",
)


@dataclass(frozen=True)
class MemoryChunk:
    path: str
    section: str
    content: str
    metadata: dict
    score: float


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
                }
            )
    return rows


def expand_query_terms(query: str) -> set[str]:
    tokens = tokenize(query)
    expanded = set(tokens)
    for group in SYNONYMS.values():
        if tokens & group:
            expanded |= group
    return expanded


def tokenize(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9øåäöü]+", text.lower()) if len(t) > 2}


def split_sections(content: str) -> list[tuple[str, str]]:
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


def score_chunk(query_terms: set[str], path: str, section: str, body: str, metadata: dict) -> float:
    hay = tokenize(f"{path} {section} {body} {metadata}")
    overlap = len(query_terms & hay)
    score = float(overlap)
    section_l = section.lower()
    path_l = path.lower()
    if query_terms & SYNONYMS["techno"] and "techno" in section_l:
        score += 4.0
    if query_terms & SYNONYMS["dj"] and "dj-set" in path_l:
        score += 4.0
    if query_terms & SYNONYMS["taste"] and "music-taste" in path_l:
        score += 4.0
    if str(metadata.get("type", "")).lower() == "preference":
        score += 1.5
    return score


def retrieve_chunks(query: str, limit: int = 6) -> list[MemoryChunk]:
    query_terms = expand_query_terms(query)
    chunks: list[MemoryChunk] = []
    for mem in load_memories():
        for section, body in split_sections(mem["content"]):
            score = score_chunk(query_terms, mem["path"], section, body, mem["metadata"])
            if score <= 0:
                continue
            chunks.append(
                MemoryChunk(
                    path=mem["path"],
                    section=section,
                    content=body,
                    metadata=mem["metadata"],
                    score=score,
                )
            )
    chunks.sort(key=lambda c: c.score, reverse=True)
    return chunks[:limit]


def extract_bullets(text: str) -> list[str]:
    bullets: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("- "):
            bullets.append(line[2:].strip())
    return bullets


def extract_artists(text: str) -> list[str]:
    artists: list[str] = []
    for bullet in extract_bullets(text):
        match = re.search(r"artists? like (.+?)(?:\.|$)", bullet, flags=re.I)
        if match:
            artists.extend([a.strip() for a in re.split(r",| and ", match.group(1)) if a.strip()])
        match = re.search(r"常提艺人[：:]\s*\*\*(.+?)\*\*", bullet)
        if match:
            artists.extend([a.strip() for a in re.split(r"、|,| and ", match.group(1)) if a.strip()])
        match = re.search(r"^([A-Za-z0-9øåäöü .&/'+-]+?) — ", bullet)
        if match:
            artists.append(match.group(1).strip())
    for token in re.findall(r"\b(DVS1|Blawan|Rødhåd|lovegold|Beatrice M\.|Harry Styles|John Beltran)\b", text):
        if token not in artists:
            artists.append(token)
    return artists


def load_dj_set_tracks() -> list[dict]:
    if not DJ_SET_PATH.exists():
        return []
    return json.loads(DJ_SET_PATH.read_text(encoding="utf-8")).get("tracks", [])


def has_unpublished_signal(chunks: list[MemoryChunk]) -> bool:
    blob = "\n".join(c.content for c in chunks)
    return any(marker in blob for marker in UNPUBLISHED_MARKERS)


def detect_intent(query: str) -> set[str]:
    ql = query.lower()
    intents: set[str] = set()
    if re.search(r"favou?rite|fav|like|into|prefer", ql):
        intents.add("preference")
    if "techno" in ql or "electronic" in ql:
        intents.add("techno")
    if "dj" in ql or "set" in ql or "carousel" in ql or "playlist" in ql:
        intents.add("dj_set")
    if re.search(r"recommend|suggest|what should|what would", ql):
        intents.add("recommend")
    if re.search(r"why|how come|reason", ql):
        intents.add("explain")
    if not intents:
        intents.add("general")
    return intents


def infer_locally(query: str, chunks: list[MemoryChunk]) -> str:
    intents = detect_intent(query)
    bullets = [b for c in chunks for b in extract_bullets(c.content)]
    artists = []
    for c in chunks:
        artists.extend(extract_artists(c.content))
    artists = list(dict.fromkeys(artists))

    unpublished = has_unpublished_signal(chunks)
    lines: list[str] = []

    if "preference" in intents and "techno" in intents:
        techno_chunks = [c for c in chunks if "techno" in c.section.lower() or "music-taste" in c.path]
        techno_bullets = [b for c in techno_chunks for b in extract_bullets(c.content)]
        if not techno_bullets:
            techno_bullets = [b for b in bullets if "techno" in b.lower() or "driving" in b.lower() or "artists like" in b.lower()]
        techno_artists: list[str] = []
        for c in techno_chunks:
            for b in extract_bullets(c.content):
                techno_artists.extend(extract_artists(b))
        techno_artists = [a for a in dict.fromkeys(techno_artists) if a not in {"Harry Styles", "lovegold", "Beatrice M.", "John Beltran / Open House", "John Beltran"}]
        if unpublished:
            lines.append("She hasn't written about her favourite techno music directly.")
        if techno_artists:
            joined = ", ".join(techno_artists[:-1]) + f", and {techno_artists[-1]}" if len(techno_artists) > 1 else techno_artists[0]
            lines.append(
                f"From what I know personally (as her agent), she's into harder, driving techno — artists like {joined}"
            )
        for b in techno_bullets:
            if "driving" in b.lower() or "偏好" in b or "harder" in b.lower():
                lines.append(f"Inference from taste memory: {b}")
                break
        if unpublished:
            lines.append("That's personal agent knowledge, not something she's published about.")

    elif "dj_set" in intents:
        tracks = load_dj_set_tracks()
        if tracks:
            rendered = ", ".join(f"{t['title']} ({t['artist']})" for t in tracks)
            lines.append(f"Her current DJ set carousel is built around: {rendered}.")
        for b in bullets:
            if "carousel" in b.lower() or "dj-set" in b.lower():
                lines.append(f"Operational note: {b}")

    elif "recommend" in intents:
        taste = [b for b in bullets if any(k in b.lower() for k in ("techno", "dubstep", "tech-house", "detroit"))]
        tracks = load_dj_set_tracks()
        if taste:
            lines.append(f"Based on her taste profile: {taste[0]}")
        if tracks:
            lines.append(
                "A reasonable inference is to sequence from atmospheric entries "
                f"(e.g. {tracks[0]['title']}) into harder selections already in her set."
            )
        if artists:
            lines.append(f"Artists aligned with memory: {', '.join(artists[:5])}.")

    else:
        if not chunks:
            return "I don't have enough memory context yet. Add or update files under aileena_second_brain/memories/."
        lines.append("From retrieved memory, here's what I can infer:")
        for c in chunks[:3]:
            snippet = extract_bullets(c.content)[:2] or [c.content.split("\n", 1)[0]]
            for s in snippet:
                lines.append(f"- [{c.section}] {s}")

    if not lines:
        return "I retrieved memory but couldn't infer a confident answer. Try a more specific question."

    return " ".join(lines)


def build_llm_context(query: str, chunks: list[MemoryChunk]) -> str:
    blocks = []
    for c in chunks:
        blocks.append(f"### {c.path} :: {c.section}\n{c.content}")
    tracks = load_dj_set_tracks()
    if tracks:
        blocks.append("### dj-set/setlist.json\n" + json.dumps(tracks, ensure_ascii=False, indent=2))
    return (
        "You are Aileena, answering as her personal agent using ONLY the memory below.\n"
        "Infer carefully. Distinguish published facts vs personal unpublished preferences.\n"
        "If memory is insufficient, say so.\n\n"
        f"Question: {query}\n\n"
        "Memory:\n" + "\n\n".join(blocks)
    )


def infer_with_llm(query: str, chunks: list[MemoryChunk]) -> str | None:
    token = os.environ.get("KS_TOKEN")
    if not token:
        return None
    try:
        sys.path.insert(0, str(REPO_ROOT / "packages" / "sdk-py"))
        from keyshield import KeyShield  # type: ignore

        ks = KeyShield(token=token, base_url=os.environ.get("KS_BASE", "http://localhost:8000"))
        client = ks.openai_client()
        prompt = build_llm_context(query, chunks)
        resp = client.chat.completions.create(
            model=os.environ.get("AILEENA_AGENT_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": "Answer concisely in English unless the user writes Chinese."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=400,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        return None


def answer(query: str, use_llm: bool = True) -> str:
    chunks = retrieve_chunks(query)
    if use_llm:
        llm = infer_with_llm(query, chunks)
        if llm:
            return llm
    return infer_locally(query, chunks)


def repl(use_llm: bool) -> int:
    mode = "memory+llm" if use_llm and os.environ.get("KS_TOKEN") else "memory inference"
    print(f"Aileena memory agent ({mode}). Type a question, or 'exit'.")
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
        print(answer(query, use_llm=use_llm))
        print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Query Aileena external memory agent")
    parser.add_argument("query", nargs="*", help="Question to ask")
    parser.add_argument("--local-only", action="store_true", help="Disable LLM inference")
    args = parser.parse_args()

    use_llm = not args.local_only
    if args.query:
        print(answer(" ".join(args.query), use_llm=use_llm))
        return 0
    return repl(use_llm=use_llm)


if __name__ == "__main__":
    raise SystemExit(main())
