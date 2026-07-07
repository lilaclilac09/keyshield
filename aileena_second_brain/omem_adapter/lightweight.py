"""Lightweight O-Mem-style extraction without torch — KeyShield LLM only."""

from __future__ import annotations

import json
import re
from pathlib import Path

from .config import OMEM_CACHE_DIR
from .keyshield_llm import chat_completion
from .persona_sync import sync_from_extraction, write_snapshot_cache

EXTRACTION_SYSTEM = """You extract user persona updates from conversation for a personal AI memory system.
Return ONLY valid JSON with keys:
- preferences: list of stable likes/interests (strings)
- attributes: list of personality/fact traits (strings)
- events: list of significant recent events (strings)
- topics: list of topic labels (strings)
- confidence: "low" | "medium" | "high"
Use empty lists when nothing new is learned. Do not invent facts not stated in the message."""


def _parse_json_blob(text: str) -> dict | None:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else None
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.S)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None


def extract_from_message(message: str, *, role: str = "user") -> dict | None:
    """LLM extraction from a single message (requires KS_TOKEN)."""
    if not message.strip():
        return None
    raw = chat_completion(
        EXTRACTION_SYSTEM,
        f"Role: {role}\nMessage:\n{message}",
        temperature=0.1,
    )
    if not raw:
        return None
    return _parse_json_blob(raw)


def ingest_turn(
    query: str,
    answer: str = "",
    *,
    sync_markdown: bool = True,
) -> dict:
    """Process one conversation turn; optionally sync persona to markdown."""
    result: dict = {"query": query, "answer": answer, "extractions": [], "synced": []}

    for role, text in (("user", query), ("agent", answer)):
        if not text.strip():
            continue
        extraction = extract_from_message(text, role=role)
        if not extraction:
            continue
        result["extractions"].append({"role": role, "data": extraction})
        if sync_markdown and extraction.get("confidence", "medium") != "low":
            paths = sync_from_extraction(extraction, source=f"omem_lightweight_{role}")
            result["synced"].extend(str(p) for p in paths)

    _append_message_log(query, answer)
    if result["synced"]:
        write_snapshot_cache()
    return result


def _append_message_log(query: str, answer: str) -> Path:
    OMEM_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    log_path = OMEM_CACHE_DIR / "message_log.jsonl"
    line = json.dumps({"query": query, "answer": answer}, ensure_ascii=False)
    with log_path.open("a", encoding="utf-8") as f:
        f.write(line + "\n")
    return log_path


def ingest_message_file(path: Path, *, sync_markdown: bool = True) -> dict:
    """Ingest JSONL with {query, answer} or {message, role} per line."""
    stats = {"lines": 0, "synced": []}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        stats["lines"] += 1
        if "query" in row:
            out = ingest_turn(row.get("query", ""), row.get("answer", ""), sync_markdown=sync_markdown)
        else:
            msg = row.get("message", "")
            role = row.get("role", "user")
            ext = extract_from_message(msg, role=role)
            out = {"synced": []}
            if ext and sync_markdown:
                out["synced"] = [str(p) for p in sync_from_extraction(ext, source="omem_file_ingest")]
        stats["synced"].extend(out.get("synced", []))
    write_snapshot_cache()
    return stats
