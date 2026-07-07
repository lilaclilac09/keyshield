"""Sync O-Mem persona extractions back to Markdown (source of truth)."""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date
from pathlib import Path

import frontmatter

from .config import OMemConfig, PERSONA_AUTO_PATH, ROOT

import sys

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

CONFIDENCE_RANK = {"low": 0, "medium": 1, "high": 2}


def _slug(text: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return base[:40] or "fact"


def _fact_fingerprint(text: str) -> str:
    return hashlib.sha256(text.strip().lower().encode()).hexdigest()[:12]


def _write_markdown(path: Path, metadata: dict, body: str) -> None:
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


def _load_persona_auto() -> tuple[dict, str, set[str]]:
    if not PERSONA_AUTO_PATH.exists():
        return {}, "", set()
    post = frontmatter.load(PERSONA_AUTO_PATH)
    fps = set(post.metadata.get("fingerprints", []) or [])
    return dict(post.metadata), post.content.strip(), fps


def _existing_bullets(content: str) -> set[str]:
    bullets: set[str] = set()
    for line in content.splitlines():
        line = line.strip()
        if line.startswith("- "):
            bullets.add(line[2:].strip().lower())
    return bullets


def append_persona_fact(
    fact: str,
    *,
    category: str = "preference",
    confidence: str = "medium",
    source: str = "omem_adapter",
    tags: list[str] | None = None,
) -> Path | None:
    """Append a deduplicated persona bullet to memories/personal/persona-auto.md."""
    fact = fact.strip()
    if not fact:
        return None

    cfg = OMemConfig()
    if CONFIDENCE_RANK.get(confidence, 0) < CONFIDENCE_RANK.get(cfg.persona_sync_min_confidence, 1):
        return None

    fp = _fact_fingerprint(fact)
    metadata, content, fingerprints = _load_persona_auto()
    if fp in fingerprints or fact.lower() in _existing_bullets(content):
        return None

    PERSONA_AUTO_PATH.parent.mkdir(parents=True, exist_ok=True)
    fingerprints.add(fp)

    if not content:
        content = "# Persona (auto-synced from O-Mem / conversation)\n\n## Preferences & traits\n"

    section = "## Preferences & traits"
    if section not in content:
        content += f"\n{section}\n"

    bullet = f"- {fact} _(confidence: {confidence}, source: {source})_"
    if section in content:
        head, _, tail = content.partition(section)
        content = head + section + "\n" + bullet + "\n" + tail.lstrip("\n")
    else:
        content += bullet + "\n"

    meta = {
        "date": date.today().isoformat(),
        "type": "preference",
        "tags": tags or [category, "omem-sync", "auto"],
        "confidence": confidence,
        "decay_speed": "medium",
        "source": source,
        "agent_id": "aileena",
        "fingerprints": sorted(fingerprints),
    }
    _write_markdown(PERSONA_AUTO_PATH, meta, content)

    from memory_store import MemoryStore

    MemoryStore.get().invalidate()
    return PERSONA_AUTO_PATH


def sync_from_extraction(extraction: dict, *, source: str = "omem_lightweight") -> list[Path]:
    """Apply structured extraction dict to persona markdown."""
    written: list[Path] = []
    for pref in extraction.get("preferences", []) or []:
        p = append_persona_fact(str(pref), category="preference", confidence="medium", source=source)
        if p:
            written.append(p)
    for attr in extraction.get("attributes", []) or []:
        p = append_persona_fact(str(attr), category="attribute", confidence="medium", source=source)
        if p:
            written.append(p)
    for event in extraction.get("events", []) or []:
        p = append_persona_fact(str(event), category="event", confidence="high", source=source)
        if p:
            written.append(p)
    return written


def sync_learned_fact(fact: str, topics: list[str] | None = None) -> Path | None:
    return append_persona_fact(
        fact,
        category="learned",
        confidence="high",
        source="agent_learn_pattern",
        tags=(topics or []) + ["learn-pattern"],
    )


def _json_safe(value: object) -> object:
    if hasattr(value, "isoformat"):
        return value.isoformat()  # type: ignore[union-attr]
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_safe(v) for v in value]
    return value


def export_persona_snapshot() -> dict:
    """JSON snapshot for O-Mem bootstrap or multi-agent share."""
    if not PERSONA_AUTO_PATH.exists():
        return {"preferences": [], "attributes": [], "events": []}
    post = frontmatter.load(PERSONA_AUTO_PATH)
    prefs, attrs, events = [], [], []
    for line in post.content.splitlines():
        line = line.strip()
        if not line.startswith("- "):
            continue
        text = re.sub(r"\s*_\(.*\)_$", "", line[2:]).strip()
        low = line.lower()
        if "confidence: high" in low and "event" in low:
            events.append(text)
        elif "attribute" in low:
            attrs.append(text)
        else:
            prefs.append(text)
    return {
        "metadata": _json_safe(dict(post.metadata)),
        "preferences": prefs,
        "attributes": attrs,
        "events": events,
    }


def write_snapshot_cache() -> Path:
    from .config import OMEM_CACHE_DIR

    OMEM_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = OMEM_CACHE_DIR / "persona_snapshot.json"
    path.write_text(json.dumps(export_persona_snapshot(), ensure_ascii=False, indent=2), encoding="utf-8")
    return path
