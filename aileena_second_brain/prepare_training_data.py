#!/usr/bin/env python3
"""Build text LoRA datasets from articles, memories, reflection logs, and DJ set."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import frontmatter

ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent
TRAINING_DIR = ROOT / "training_data"
DJ_SET_PATH = REPO_ROOT / "dj-set" / "setlist.json"

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
MAX_CHUNK_CHARS = 1200


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
        "music": "根据以下曲目与策展上下文，给出符合品味的 DJ set 建议。",
    }
    if category == "article":
        return mapping["article"]
    if category == "music":
        return mapping["music"]
    return mapping.get(content_type, "根据以下上下文，给出高质量、可执行的回答。")


def chunk_markdown(content: str, max_chars: int = MAX_CHUNK_CHARS) -> list[str]:
    sections = re.split(r"\n(?=## )", content.strip())
    chunks: list[str] = []

    for section in sections:
        section = section.strip()
        if not section:
            continue
        if len(section) <= max_chars:
            chunks.append(section)
            continue

        paragraphs = [p.strip() for p in section.split("\n\n") if p.strip()]
        current = ""
        for paragraph in paragraphs:
            candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
            if len(candidate) <= max_chars:
                current = candidate
            else:
                if current:
                    chunks.append(current)
                current = paragraph
        if current:
            chunks.append(current)

    return chunks


def iter_markdown_files(directory: Path) -> list[Path]:
    if not directory.exists():
        return []
    return sorted(
        p
        for p in directory.rglob("*.md")
        if p.is_file() and p.name.lower() not in SKIP_FILENAMES
    )


def load_markdown_samples(path: Path, category: str, slice_chunks: bool) -> list[Sample]:
    post = frontmatter.load(path)
    content = post.content.strip()
    if not content:
        return []

    metadata = dict(post.metadata)
    content_type = str(metadata.get("type", category)).lower()
    title = str(metadata.get("title", path.stem))
    instruction = instruction_for_type(content_type, category)

    base_input = json.loads(metadata_json(metadata)) if metadata_json(metadata) else {}
    if category == "article":
        base_input["title"] = title

    chunks = chunk_markdown(content) if slice_chunks else [content]
    samples: list[Sample] = []

    for idx, chunk in enumerate(chunks, start=1):
        payload = dict(base_input)
        payload["chunk_id"] = idx
        samples.append(
            Sample(
                instruction=instruction,
                input=json.dumps(payload, ensure_ascii=False),
                output=chunk,
                source=f"{path.relative_to(ROOT)}#chunk-{idx}",
                category=category,
            )
        )

    return samples


def track_output(track: dict) -> str:
    lines = [
        f"曲目：{track.get('title')} — {track.get('artist')}",
        f"专辑：{track.get('album')}",
        f"来源：{track.get('source_type')}",
    ]
    if track.get("search_query"):
        lines.append(f"搜索词：{track['search_query']}")
    if track.get("spotify", {}).get("url"):
        lines.append(f"Spotify：{track['spotify']['url']}")
    if track.get("links"):
        for key, url in track["links"].items():
            lines.append(f"{key}: {url}")
    lines.append(f"封面：{track.get('cover')} ({track.get('cover_source', 'unknown')})")
    return "\n".join(lines)


def load_dj_set_samples() -> list[Sample]:
    if not DJ_SET_PATH.exists():
        return []

    data = json.loads(DJ_SET_PATH.read_text(encoding="utf-8"))
    samples: list[Sample] = []

    for track in data.get("tracks", []):
        payload = {
            "set_id": data.get("id"),
            "position": track.get("position"),
            "title": track.get("title"),
            "artist": track.get("artist"),
            "album": track.get("album"),
            "source_type": track.get("source_type"),
            "search_query": track.get("search_query"),
            "spotify": track.get("spotify"),
            "links": track.get("links"),
            "cover": track.get("cover"),
            "cover_source": track.get("cover_source"),
        }
        samples.append(
            Sample(
                instruction=instruction_for_type("music", "music"),
                input=json.dumps(payload, ensure_ascii=False),
                output=track_output(track),
                source=f"dj-set/setlist.json#track-{track.get('position')}",
                category="music",
            )
        )

    return samples


def collect_samples(slice_chunks: bool = True) -> list[Sample]:
    samples: list[Sample] = []

    for memory_dir in MEMORY_DIRS:
        for path in iter_markdown_files(memory_dir):
            samples.extend(load_markdown_samples(path, category="memory", slice_chunks=slice_chunks))

    for path in iter_markdown_files(REFLECTION_DIR):
        samples.extend(load_markdown_samples(path, category="reflection", slice_chunks=False))

    for path in iter_markdown_files(ARTICLES_DIR):
        samples.extend(load_markdown_samples(path, category="article", slice_chunks=slice_chunks))

    samples.extend(load_dj_set_samples())
    return samples


def write_jsonl(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def prepare_training_data(slice_chunks: bool = True) -> dict[str, int]:
    samples = collect_samples(slice_chunks=slice_chunks)

    all_rows = [s.to_dict() for s in samples]
    memory_rows = [s.to_dict() for s in samples if s.category == "memory"]
    reflection_rows = [s.to_dict() for s in samples if s.category == "reflection"]
    article_rows = [s.to_dict() for s in samples if s.category == "article"]
    music_rows = [s.to_dict() for s in samples if s.category == "music"]

    write_jsonl(TRAINING_DIR / "text_all.jsonl", all_rows)
    write_jsonl(TRAINING_DIR / "memories.jsonl", memory_rows)
    write_jsonl(TRAINING_DIR / "reflections.jsonl", reflection_rows)
    write_jsonl(TRAINING_DIR / "articles.jsonl", article_rows)
    write_jsonl(TRAINING_DIR / "music.jsonl", music_rows)
    write_jsonl(TRAINING_DIR / "skills.jsonl", reflection_rows or all_rows)

    stats = {
        "total": len(all_rows),
        "memory": len(memory_rows),
        "reflection": len(reflection_rows),
        "article": len(article_rows),
        "music": len(music_rows),
    }
    print("Prepared text datasets:")
    for key, value in stats.items():
        print(f"  {key}: {value}")
    print(f"  output_dir: {TRAINING_DIR}")
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare text LoRA datasets")
    parser.add_argument("--no-slice", action="store_true", help="Disable markdown chunk slicing")
    args = parser.parse_args()
    prepare_training_data(slice_chunks=not args.no_slice)


if __name__ == "__main__":
    main()
