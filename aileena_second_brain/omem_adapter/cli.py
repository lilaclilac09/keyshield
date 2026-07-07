#!/usr/bin/env python3
"""CLI for O-Mem adapter (lightweight or full bridge)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from omem_adapter.bridge import bootstrap_from_markdown, is_omem_available, run_ingest_turn
from omem_adapter.lightweight import ingest_message_file
from omem_adapter.persona_sync import append_persona_fact, export_persona_snapshot, write_snapshot_cache


def main() -> int:
    parser = argparse.ArgumentParser(description="Aileena O-Mem adapter (L4)")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_ingest = sub.add_parser("ingest", help="Ingest one turn (query + optional answer)")
    p_ingest.add_argument("query", help="User message or query")
    p_ingest.add_argument("--answer", default="", help="Agent answer")
    p_ingest.add_argument("--no-sync", action="store_true", help="Skip markdown persona sync")

    p_file = sub.add_parser("ingest-file", help="Ingest JSONL conversation log")
    p_file.add_argument("path", type=Path)

    sub.add_parser("bootstrap", help="Export markdown persona → .cache/omem snapshot")

    p_fact = sub.add_parser("add-fact", help="Manually append persona fact")
    p_fact.add_argument("fact")
    p_fact.add_argument("--confidence", default="high", choices=["low", "medium", "high"])

    p_status = sub.add_parser("status", help="Show adapter status")

    args = parser.parse_args()

    if args.cmd == "ingest":
        out = run_ingest_turn(args.query, args.answer, sync_markdown=not args.no_sync)
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "ingest-file":
        stats = ingest_message_file(args.path, sync_markdown=True)
        print(json.dumps(stats, ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "bootstrap":
        snap = bootstrap_from_markdown()
        print(json.dumps(snap, ensure_ascii=False, indent=2))
        return 0

    if args.cmd == "add-fact":
        path = append_persona_fact(args.fact, confidence=args.confidence, source="cli_manual")
        print(path or "(duplicate or below confidence threshold)")
        write_snapshot_cache()
        return 0

    if args.cmd == "status":
        print(
            json.dumps(
                {
                    "full_omem_available": is_omem_available(),
                    "ks_token_set": bool(__import__("os").environ.get("KS_TOKEN")),
                    "persona_snapshot": export_persona_snapshot(),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 0

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
