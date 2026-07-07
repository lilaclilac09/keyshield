#!/usr/bin/env python3
"""Build text LoRA datasets from articles, memories, and reflection logs."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import frontmatter

ROOT = Path(__file__).resolve().parent
TRAINING_DIR = ROOT / "training_data"

MEMORY_DIRS = [
    ROOT / "memories" / "personal",
    ROOT / "memories" / "semantic",
    ROOT / "memories" / "procedural" / "skills",
    ROOT / "memories" / "episodic",
    ROOT / "memories" / "archived",
]
REFLECTION_DIR = ROOT / "reflection_logs"
ARTICLES_DIR = ROOT / "articles"

SKIP_FILENAMES = {"index.md", "_template.md", "readme.md"}


@dataclass(frozen=True)
class Sample:
    instruction: str
    input: str
    output: str
    source: str
    category: str

    def to_dict(self) -> dict[str, str]:
        return {
            "instruction": self.instruction,
            "input": self.input,
            "output": self.output,
            "source": self.source,
            "category": self.category,
        }


def metadata_json(metadata: dict) -> str:
  serializable: dict[str, object] = {}
  for key, value in metadata.items():
    if isinstance(value, date):
      serializable[key] = value.isoformat()
    else:
      serializable[key] = value
  return json.dumps(serializable, ensure_ascii=False) if serializable else ""


def instruction_for_type(content_type: str, category: str) -> str:
  mapping = {
    "skill": "根据以下上下文，复现并执行这个可复用技能。",
    "fact": "根据以下知识上下文，准确回答相关问题。",
    "preference": "根据以下个人偏好与规则，给出符合风格与约束的建议。",
    "experience": "根据以下任务轨迹，总结关键决策与可复用经验。",
    "article": "根据以下文章主题与上下文，用作者风格输出内容。",
    "reflection": "根据以下任务轨迹和反思，提炼一个可复用技能。",
  }
  if category == "article":
    return mapping["article"]
  return mapping.get(content_type, "根据以下上下文，给出高质量、可执行的回答。")


def iter_markdown_files(directory: Path) -> list[Path]:
  if not directory.exists():
    return []
  return sorted(
    p
    for p in directory.rglob("*.md")
    if p.is_file() and p.name.lower() not in SKIP_FILENAMES
  )


def load_sample(path: Path, category: str) -> Sample | None:
  post = frontmatter.load(path)
  content = post.content.strip()
  if not content:
    return None

  metadata = dict(post.metadata)
  content_type = str(metadata.get("type", category)).lower()
  title = str(metadata.get("title", path.stem))

  instruction = instruction_for_type(content_type, category)
  input_context = metadata_json(metadata)
  if category == "article":
    base = json.loads(input_context) if input_context else {}
    base["title"] = title
    input_context = json.dumps(base, ensure_ascii=False)

  return Sample(
    instruction=instruction,
    input=input_context,
    output=content,
    source=str(path.relative_to(ROOT)),
    category=category,
  )


def collect_samples() -> list[Sample]:
  samples: list[Sample] = []

  for memory_dir in MEMORY_DIRS:
    for path in iter_markdown_files(memory_dir):
      sample = load_sample(path, category="memory")
      if sample:
        samples.append(sample)

  for path in iter_markdown_files(REFLECTION_DIR):
    sample = load_sample(path, category="reflection")
    if sample:
      samples.append(sample)

  for path in iter_markdown_files(ARTICLES_DIR):
    sample = load_sample(path, category="article")
    if sample:
      samples.append(sample)

  return samples


def write_jsonl(path: Path, rows: list[dict[str, str]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  with path.open("w", encoding="utf-8") as f:
    for row in rows:
      f.write(json.dumps(row, ensure_ascii=False) + "\n")


def prepare_training_data() -> dict[str, int]:
  samples = collect_samples()

  all_rows = [s.to_dict() for s in samples]
  memory_rows = [s.to_dict() for s in samples if s.category == "memory"]
  reflection_rows = [s.to_dict() for s in samples if s.category == "reflection"]
  article_rows = [s.to_dict() for s in samples if s.category == "article"]

  write_jsonl(TRAINING_DIR / "text_all.jsonl", all_rows)
  write_jsonl(TRAINING_DIR / "memories.jsonl", memory_rows)
  write_jsonl(TRAINING_DIR / "reflections.jsonl", reflection_rows)
  write_jsonl(TRAINING_DIR / "articles.jsonl", article_rows)

  # Backward compatibility for existing Axolotl config
  write_jsonl(TRAINING_DIR / "skills.jsonl", reflection_rows or all_rows)

  stats = {
    "total": len(all_rows),
    "memory": len(memory_rows),
    "reflection": len(reflection_rows),
    "article": len(article_rows),
  }
  print("Prepared text datasets:")
  for key, value in stats.items():
    print(f"  {key}: {value}")
  print(f"  output_dir: {TRAINING_DIR}")
  return stats


def main() -> None:
  parser = argparse.ArgumentParser(description="Prepare text LoRA datasets")
  parser.parse_args()
  prepare_training_data()


if __name__ == "__main__":
  main()
