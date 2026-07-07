#!/usr/bin/env python3
"""Aileena memory agent — fast index, context memory, self-evolution."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path

import frontmatter

from context_memory import ContextMemory, detect_topics
from evolve import evolve_after_turn, run_full_evolution
from memory_store import MemoryStore

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
DJ_SET_PATH = REPO_ROOT / "dj-set" / "setlist.json"

SYNONYMS = {
    "fav": {"fav", "favorite", "favourite", "like", "loves", "into"},
    "techno": {"techno", "electronic", "club", "rave"},
    "dj": {"dj", "set", "carousel", "playlist", "crate"},
    "taste": {"taste", "style", "preference", "into", "vibe"},
    "culture": {"didion", "hockney", "joan", "david", "art", "literature", "documentary", "podcast", "book"},
    "memory": {"memory", "memories", "context", "evolve", "remember", "记忆", "上下文"},
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


def expand_query_terms(query: str) -> set[str]:
    tokens = tokenize(query)
    expanded = set(tokens)
    for group in SYNONYMS.values():
        if tokens & group:
            expanded |= group
    ctx = ContextMemory()
    for topic in ctx.retrieval_boost_topics():
        if topic in SYNONYMS:
            expanded |= SYNONYMS[topic]
    return expanded


def tokenize(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9øåäöü]+", text.lower()) if len(t) > 2}


def score_chunk(
    query_terms: set[str],
    path: str,
    section: str,
    body: str,
    metadata: dict,
    context_topics: set[str],
) -> float:
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
    if query_terms & SYNONYMS["culture"] and "culture-taste" in path_l:
        score += 5.0
    if query_terms & SYNONYMS["memory"] and any(k in path_l for k in ("episodic", "semantic", "context")):
        score += 3.0
    if "voice-profile" in path_l:
        score += 0.5
    if str(metadata.get("type", "")).lower() == "preference":
        score += 1.5
    for topic in context_topics:
        if topic in path_l or topic in section_l or topic in body.lower():
            score += 2.0
        if topic in SYNONYMS and query_terms & SYNONYMS[topic]:
            score += 1.5
    return score


def load_voice_profile_text() -> str:
    path = ROOT / "memories" / "personal" / "voice-profile.md"
    if not path.exists():
        return ""
    return frontmatter.load(path).content.strip()


def stylize_as_aileen(answer: str, query: str) -> str:
    answer = (
        answer.replace("Inference from taste memory: ", "")
        .replace("Operational note: ", "")
        .replace("Based on her taste profile: ", "From her taste — ")
        .replace(
            "That's personal agent knowledge, not something she's published about.",
            "That's personal — not something she's published.",
        )
        .replace("From retrieved memory, here's what I can infer:", "Here's how I'd put it —")
        .replace("  ", " ")
        .strip()
    )
    if "送" in query and answer and not answer.lower().startswith("if you're asking what she'd send"):
        answer = f"If you're asking what she'd send you — {answer[0].lower()}{answer[1:]}"
    return answer


def retrieve_chunks(query: str, limit: int = 6) -> list[MemoryChunk]:
    t0 = time.perf_counter()
    query_terms = expand_query_terms(query)
    ctx = ContextMemory()
    context_topics = ctx.retrieval_boost_topics()
    chunks: list[MemoryChunk] = []
    for row in MemoryStore.get().chunks():
        score = score_chunk(
            query_terms,
            row["path"],
            row["section"],
            row["content"],
            row["metadata"],
            context_topics,
        )
        if score <= 0:
            continue
        chunks.append(
            MemoryChunk(
                path=row["path"],
                section=row["section"],
                content=row["content"],
                metadata=row["metadata"],
                score=score,
            )
        )
    chunks.sort(key=lambda c: c.score, reverse=True)
    elapsed_ms = (time.perf_counter() - t0) * 1000
    if os.environ.get("AILEENA_DEBUG_TIMING"):
        print(f"[retrieve {elapsed_ms:.1f}ms]", file=sys.stderr)
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
    if any(k in ql for k in ("didion", "hockney", "documentary", "podcast", "joan", "david")):
        intents.add("culture")
    if "送" in query or re.search(r"\bsend\b|recommend|suggest", ql):
        intents.add("recommend")
    if any(k in ql for k in ("memory", "context", "evolve", "remember")) or "记忆" in query or "上下文" in query:
        intents.add("memory_meta")
    if not intents:
        intents.add("general")
    return intents


def infer_memory_meta(query: str, chunks: list[MemoryChunk]) -> str:
    stats = MemoryStore.get().stats()
    ctx = ContextMemory()
    lines = [
        "Memory stack is live — index cache for instant retrieval, context file for this session, episodic auto-capture after each turn.",
        f"Indexed {stats['files']} files / {stats['chunks']} chunks.",
    ]
    if ctx.state.active_topics:
        lines.append(f"Session context is tracking: {', '.join(ctx.state.active_topics)}.")
    recent = ctx.recent_queries(2)
    if recent:
        lines.append(f"Recent thread: {' → '.join(recent)}.")
    if "自进化" in query or "evolve" in query.lower():
        lines.append("Self-evolution path: turn → episodic write → consolidate.py promotes high-confidence facts → index invalidates and rebuilds.")
    return " ".join(lines)


def infer_culture(query: str, chunks: list[MemoryChunk]) -> str:
    culture_chunks = [
        c
        for c in chunks
        if "culture-taste" in c.path or "didion" in c.content.lower() or "hockney" in c.content.lower()
    ]
    bullets = [b for c in culture_chunks for b in extract_bullets(c.content)]
    send_mode = "送" in query or re.search(r"\bsend\b|recommend|suggest", query.lower())

    lines: list[str] = []
    if send_mode:
        lines.append(
            "If you're asking what she'd send you — I'd start with Joan Didion and David Hockney, "
            "not as abstract names but as a pair: language + image."
        )
        lines.append(
            "For Didion: *We Tell Ourselves Stories* (Alissa Wilkinson) plus the podcast conversation on "
            "*The Colin McEnroe Show* (Feb 2026) — that's the newer thread she's actually tracking."
        )
        lines.append(
            "For Hockney: BBC *Front Row — David Hockney special* (Jun 2026). "
            "If she wants one documentary anchor, it's still *The Center Will Not Hold* for Didion — "
            "and for Hockney right now it's tribute audio more than a new film."
        )
        lines.append("She'd probably add one mood track from her DJ set after that — Daydreaming works as the soft opener.")
    else:
        lines.append("She's deeply into Joan Didion and David Hockney — prose clarity and visual appetite, same instinct.")
        for b in bullets[:4]:
            if any(k in b.lower() for k in ("didion", "hockney", "podcast", "documentary", "front row")):
                lines.append(b)
    return " ".join(lines)


def infer_locally(query: str, chunks: list[MemoryChunk]) -> str:
    intents = detect_intent(query)
    bullets = [b for c in chunks for b in extract_bullets(c.content)]
    artists = []
    for c in chunks:
        artists.extend(extract_artists(c.content))
    artists = list(dict.fromkeys(artists))

    unpublished = has_unpublished_signal(chunks)
    lines: list[str] = []

    if "memory_meta" in intents:
        return infer_memory_meta(query, chunks)

    if "culture" in intents:
        return infer_culture(query, chunks)

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
        return stylize_as_aileen(
            "I don't have enough memory context yet — add more under aileena_second_brain/memories/.",
            query,
        )

    return stylize_as_aileen(" ".join(lines), query)


def build_llm_context(query: str, chunks: list[MemoryChunk]) -> str:
    blocks = []
    voice = load_voice_profile_text()
    ctx = ContextMemory()
    if voice:
        blocks.append("### voice-profile\n" + voice)
    context_block = ctx.context_block()
    if context_block:
        blocks.append("### session-context\n" + context_block)
    for c in chunks:
        blocks.append(f"### {c.path} :: {c.section}\n{c.content}")
    tracks = load_dj_set_tracks()
    if tracks:
        blocks.append("### dj-set/setlist.json\n" + json.dumps(tracks, ensure_ascii=False, indent=2))
    return (
        "You are answering as Aileen's personal agent (Aileena).\n"
        "Mimic her voice exactly using the voice-profile memory.\n"
        "Use session context for follow-up questions.\n"
        "Infer from memory only. Distinguish published facts vs personal preferences.\n"
        "If memory is insufficient, say so in her tone.\n\n"
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
        voice = load_voice_profile_text()
        system_prompt = (
            "You are Aileen's personal agent. Mimic her voice from the voice-profile memory: "
            "calm, specific, observational, em dashes, no assistant boilerplate. "
            "Answer in English unless the user writes Chinese. "
            "Use session context for follow-ups. Infer; do not invent facts outside memory."
        )
        if voice:
            system_prompt += f"\n\nVoice profile:\n{voice}"
        resp = client.chat.completions.create(
            model=os.environ.get("AILEENA_AGENT_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            temperature=0.35,
            max_tokens=500,
        )
        content = (resp.choices[0].message.content or "").strip()
        return stylize_as_aileen(content, query) if content else None
    except Exception:
        return None


def answer(
    query: str,
    use_llm: bool = True,
    *,
    evolve: bool = True,
    show_memory: bool = False,
) -> str:
    chunks = retrieve_chunks(query)
    intents = detect_intent(query)
    if use_llm:
        llm = infer_with_llm(query, chunks)
        if llm:
            result = llm
        else:
            result = infer_locally(query, chunks)
    else:
        result = infer_locally(query, chunks)

    if show_memory:
        debug = ["--- memory debug ---"]
        for c in chunks:
            debug.append(f"[{c.score:.1f}] {c.path} :: {c.section}")
        debug.append(f"index: {MemoryStore.get().stats()}")
        debug.append(f"context topics: {ContextMemory().state.active_topics}")
        result = result + "\n" + "\n".join(debug)

    ctx = ContextMemory()
    turn = ctx.append_turn(query, result, intents, [c.path for c in chunks])
    if evolve:
        counts: dict[str, int] = {}
        for t in ctx.state.turns:
            for topic in t.topics:
                counts[topic] = counts.get(topic, 0) + 1
        evolve_after_turn(
            query,
            result,
            intents,
            turn.topics,
            [c.path for c in chunks],
            context_topic_counts=counts,
        )
        MemoryStore.get().refresh()

    return result


def repl(use_llm: bool, evolve: bool) -> int:
    mode = "memory+llm" if use_llm and os.environ.get("KS_TOKEN") else "memory inference"
    stats = MemoryStore.get().stats()
    print(f"Aileena memory agent ({mode}) — {stats['chunks']} chunks indexed. Type a question, or 'exit'.")
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
        print(answer(query, use_llm=use_llm, evolve=evolve))
        print()


def main() -> int:
    parser = argparse.ArgumentParser(description="Query Aileena external memory agent")
    parser.add_argument("query", nargs="*", help="Question to ask")
    parser.add_argument("--local-only", action="store_true", help="Disable LLM inference")
    parser.add_argument("--no-evolve", action="store_true", help="Skip episodic capture for this query")
    parser.add_argument("--show-memory", action="store_true", help="Print retrieved chunks")
    parser.add_argument("--clear-context", action="store_true", help="Reset session context")
    parser.add_argument("--evolve-now", action="store_true", help="Run consolidation + index rebuild")
    args = parser.parse_args()

    if args.clear_context:
        ContextMemory().clear()
        print("Context memory cleared.")
        if not args.query:
            return 0

    if args.evolve_now:
        stats = run_full_evolution()
        print(f"Evolution complete: {stats}")
        if not args.query:
            return 0

    use_llm = not args.local_only
    evolve = not args.no_evolve
    if args.query:
        print(answer(" ".join(args.query), use_llm=use_llm, evolve=evolve, show_memory=args.show_memory))
        return 0
    return repl(use_llm=use_llm, evolve=evolve)


if __name__ == "__main__":
    raise SystemExit(main())
