#!/usr/bin/env python3
"""Prepare LoRA training data from reflection logs (skill distillation)."""

from __future__ import annotations

import glob
import json
from datetime import date
from pathlib import Path

import frontmatter

ROOT = Path(__file__).resolve().parent
REFLECTION_DIR = ROOT / "reflection_logs"
OUTPUT_PATH = ROOT / "training_data" / "skills.jsonl"

INSTRUCTION = "根据以下任务轨迹和反思，提炼一个可复用技能。"


def metadata_json(metadata: dict) -> str:
    """Serialize frontmatter metadata, converting dates to ISO strings."""
    serializable: dict[str, object] = {}
    for key, value in metadata.items():
        if isinstance(value, date):
            serializable[key] = value.isoformat()
        else:
            serializable[key] = value
    return json.dumps(serializable, ensure_ascii=False) if serializable else ""


def prepare_lora_data() -> int:
    """Convert reflection markdown files into Alpaca-style JSONL samples."""
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    data: list[dict[str, str]] = []
    for filepath in sorted(glob.glob(str(REFLECTION_DIR / "*.md"))):
        post = frontmatter.load(filepath)
        content = post.content.strip()
        if not content:
            continue

        metadata = dict(post.metadata)
        input_context = metadata_json(metadata)

        data.append(
            {
                "instruction": INSTRUCTION,
                "input": input_context,
                "output": content,
            }
        )

    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        for item in data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    print(f"Prepared {len(data)} samples -> {OUTPUT_PATH}")
    return len(data)


if __name__ == "__main__":
    prepare_lora_data()
