#!/usr/bin/env python3
"""Working / session context — hot memory across turns, retrieval boost, compression."""

from __future__ import annotations

import json
import re
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / ".cache"
CONTEXT_PATH = CACHE_DIR / "context.json"

MAX_TURNS = 24
MAX_SUMMARY_CHARS = 1200

TOPIC_PATTERNS: dict[str, re.Pattern[str]] = {
    "techno": re.compile(r"techno|electronic|club|rave|dvs1|blawan", re.I),
    "dj_set": re.compile(r"dj|set|carousel|playlist|crate|track", re.I),
    "culture": re.compile(r"didion|hockney|documentary|podcast|joan|david|art|literature|送", re.I),
    "voice": re.compile(r"voice|tone|口吻|说话", re.I),
    "memory": re.compile(r"memory|记忆|context|上下文|evolve|自进化", re.I),
    "fable5": re.compile(r"fable|opus|cursor|workflow|plan", re.I),
}


@dataclass
class Turn:
    query: str
    answer: str
    intents: list[str] = field(default_factory=list)
    topics: list[str] = field(default_factory=list)
    retrieved_paths: list[str] = field(default_factory=list)
    ts: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class ContextState:
    session_id: str
    turns: list[Turn] = field(default_factory=list)
    active_topics: list[str] = field(default_factory=list)
    summary: str = ""
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def detect_topics(text: str) -> list[str]:
    found = [name for name, pattern in TOPIC_PATTERNS.items() if pattern.search(text)]
    return found


def _default_session_id() -> str:
    return f"session-{int(time.time())}"


class ContextMemory:
    def __init__(self, path: Path = CONTEXT_PATH) -> None:
        self.path = path
        self.state = self._load()

    def _load(self) -> ContextState:
        if not self.path.exists():
            return ContextState(session_id=_default_session_id())
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            turns = [Turn(**t) for t in raw.get("turns", [])]
            return ContextState(
                session_id=raw.get("session_id", _default_session_id()),
                turns=turns,
                active_topics=raw.get("active_topics", []),
                summary=raw.get("summary", ""),
                updated_at=raw.get("updated_at", datetime.now(timezone.utc).isoformat()),
            )
        except (json.JSONDecodeError, TypeError, KeyError):
            return ContextState(session_id=_default_session_id())

    def save(self) -> None:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        payload = {
            "session_id": self.state.session_id,
            "turns": [asdict(t) for t in self.state.turns],
            "active_topics": self.state.active_topics,
            "summary": self.state.summary,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        self.path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def clear(self) -> None:
        self.state = ContextState(session_id=_default_session_id())
        self.save()

    def append_turn(
        self,
        query: str,
        answer: str,
        intents: list[str] | set[str],
        retrieved_paths: list[str],
    ) -> Turn:
        topics = list(dict.fromkeys(detect_topics(query) + detect_topics(answer)))
        turn = Turn(
            query=query,
            answer=answer,
            intents=sorted(intents),
            topics=topics,
            retrieved_paths=retrieved_paths,
        )
        self.state.turns.append(turn)
        if len(self.state.turns) > MAX_TURNS:
            self._compress_old_turns()
        self._refresh_active_topics()
        self.save()
        return turn

    def _refresh_active_topics(self) -> None:
        counts: dict[str, int] = {}
        for turn in self.state.turns[-8:]:
            for topic in turn.topics:
                counts[topic] = counts.get(topic, 0) + 1
        ranked = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)
        self.state.active_topics = [name for name, _ in ranked[:6]]

    def _compress_old_turns(self) -> None:
        keep = self.state.turns[-12:]
        dropped = self.state.turns[:-12]
        lines = [self.state.summary] if self.state.summary else []
        for turn in dropped:
            lines.append(f"Q: {turn.query[:120]} | A: {turn.answer[:160]}")
        blob = " | ".join(lines)
        self.state.summary = blob[-MAX_SUMMARY_CHARS:]
        self.state.turns = keep

    def retrieval_boost_topics(self) -> set[str]:
        return set(self.state.active_topics)

    def recent_queries(self, n: int = 3) -> list[str]:
        return [t.query for t in self.state.turns[-n:]]

    def context_block(self) -> str:
        parts: list[str] = []
        if self.state.summary:
            parts.append(f"Compressed history: {self.state.summary}")
        if self.state.active_topics:
            parts.append(f"Active topics: {', '.join(self.state.active_topics)}")
        recent = self.state.turns[-3:]
        for turn in recent:
            parts.append(f"Recent Q: {turn.query}")
            parts.append(f"Recent A: {turn.answer[:220]}")
        return "\n".join(parts)

    def last_turn(self) -> Turn | None:
        return self.state.turns[-1] if self.state.turns else None
