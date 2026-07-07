#!/usr/bin/env python3
"""Self-evolution hooks — episodic capture, promotion signals, consolidation."""

from __future__ import annotations

import hashlib
import re
from datetime import date
from pathlib import Path

import frontmatter

from consolidate import run_consolidation

ROOT = Path(__file__).resolve().parent
EPISODIC_DIR = ROOT / "memories" / "episodic"
SEMANTIC_DIR = ROOT / "memories" / "semantic"

LEARN_PATTERNS = [
    re.compile(r"(?:she|aileen|她)(?:\s+also)?\s+(?:likes?|loves?|prefers?|喜欢|也爱)\s+(.+)", re.I),
    re.compile(r"(?:remember|记住|记下)\s*[：:]\s*(.+)", re.I),
    re.compile(r"(?:update|更新)\s*(?:memory|记忆)\s*[：:]\s*(.+)", re.I),
]


def _write_markdown(path: Path, metadata: dict, body: str) -> None:
    """Write markdown with YAML frontmatter (avoids frontmatter.dumps Post quirks)."""
    lines = ["---"]
    for key, value in metadata.items():
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f"  - {item}")
        else:
            lines.append(f"{key}: {value}")
    lines.append("---")
    lines.append("")
    path.write_text("\n".join(lines) + body.rstrip() + "\n", encoding="utf-8")


def _slug(text: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return base[:48] or "note"


def _fingerprint(query: str, answer: str) -> str:
    return hashlib.sha256(f"{query}\n{answer}".encode()).hexdigest()[:16]


def extract_learnable_fact(query: str) -> str | None:
    for pattern in LEARN_PATTERNS:
        match = pattern.search(query)
        if match:
            return match.group(1).strip()
    return None


def episodic_exists(fingerprint: str) -> bool:
    if not EPISODIC_DIR.exists():
        return False
    for path in EPISODIC_DIR.rglob("*.md"):
        post = frontmatter.load(path)
        if str(post.metadata.get("fingerprint", "")) == fingerprint:
            return True
    return False


def write_episodic(
    query: str,
    answer: str,
    intents: list[str] | set[str],
    topics: list[str],
    retrieved_paths: list[str],
    *,
    learn_fact: str | None = None,
) -> Path | None:
    EPISODIC_DIR.mkdir(parents=True, exist_ok=True)
    fp = _fingerprint(query, answer)
    if episodic_exists(fp):
        return None

    title = learn_fact or query.strip()[:80]
    slug = _slug(title)
    path = EPISODIC_DIR / f"{date.today().isoformat()}-{slug}.md"
    if path.exists():
        path = EPISODIC_DIR / f"{date.today().isoformat()}-{slug}-{fp[:6]}.md"

    body_lines = [
        f"# Episodic: {title}",
        "",
        "## Query",
        query,
        "",
        "## Agent answer",
        answer,
        "",
        "## Retrieved",
        "\n".join(f"- {p}" for p in retrieved_paths[:8]) or "- (none)",
        "",
        "## Inference",
        f"- intents: {', '.join(sorted(intents))}",
        f"- topics: {', '.join(topics)}",
    ]
    if learn_fact:
        body_lines.extend(["", "## Learned fact", learn_fact])

    _write_markdown(
        path,
        {
            "date": date.today().isoformat(),
            "type": "experience",
            "tags": topics or ["interaction"],
            "confidence": "high" if learn_fact else "medium",
            "decay_speed": "fast" if not learn_fact else "medium",
            "source": "agent_turn",
            "fingerprint": fp,
            "agent_id": "aileena",
        },
        "\n".join(body_lines) + "\n",
    )
    return path


def maybe_promote_hot_topic(topics: list[str], context_topic_counts: dict[str, int]) -> Path | None:
    """Promote repeatedly discussed topics into semantic stubs."""
    for topic in topics:
        if context_topic_counts.get(topic, 0) < 3:
            continue
        target = SEMANTIC_DIR / f"hot-topic-{topic}.md"
        if target.exists():
            continue
        SEMANTIC_DIR.mkdir(parents=True, exist_ok=True)
        _write_markdown(
            target,
            {
                "date": date.today().isoformat(),
                "type": "fact",
                "tags": [topic, "context-promoted"],
                "confidence": "medium",
                "decay_speed": "fast",
                "source": "context_evolution",
                "agent_id": "aileena",
            },
            f"# Hot topic: {topic}\n\nRepeated in session context — prioritize retrieval for related queries.\n",
        )
        return target
    return None


def evolve_after_turn(
    query: str,
    answer: str,
    intents: list[str] | set[str],
    topics: list[str],
    retrieved_paths: list[str],
    context_topic_counts: dict[str, int] | None = None,
) -> dict[str, str | None]:
    """Record episodic memory and run light consolidation when useful."""
    from memory_store import MemoryStore

    learn_fact = extract_learnable_fact(query)
    episodic_path = write_episodic(
        query,
        answer,
        intents,
        topics,
        retrieved_paths,
        learn_fact=learn_fact,
    )
    promoted = None
    if context_topic_counts:
        promoted = maybe_promote_hot_topic(topics, context_topic_counts)

    stats = {"episodic": str(episodic_path) if episodic_path else None, "promoted": str(promoted) if promoted else None}

    if learn_fact or promoted:
        consolidation = run_consolidation()
        stats["consolidation"] = str(consolidation)
        MemoryStore.get().invalidate()

    return stats


def run_full_evolution() -> dict:
    from memory_store import MemoryStore

    stats = run_consolidation()
    MemoryStore.get().invalidate()
    return stats
