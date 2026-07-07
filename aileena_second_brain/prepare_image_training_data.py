#!/usr/bin/env python3
"""Build image LoRA datasets from local images + captions."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import frontmatter

ROOT = Path(__file__).resolve().parent
IMAGES_DIR = ROOT / "training_data" / "images"
RAW_DIR = IMAGES_DIR / "raw"
CAPTIONS_DIR = IMAGES_DIR / "captions"
MANIFEST_SOURCE = IMAGES_DIR / "manifest.source.jsonl"
OUTPUT_JSONL = IMAGES_DIR / "images.jsonl"
OUTPUT_METADATA = IMAGES_DIR / "metadata.jsonl"

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}


def read_caption(image_path: Path) -> tuple[str, dict]:
  caption_path = CAPTIONS_DIR / f"{image_path.stem}.md"
  if caption_path.exists():
    post = frontmatter.load(caption_path)
    text = post.content.strip()
    return text, dict(post.metadata)

  txt_path = CAPTIONS_DIR / f"{image_path.stem}.txt"
  if txt_path.exists():
    return txt_path.read_text(encoding="utf-8").strip(), {}

  return "", {}


def load_manifest_overrides() -> dict[str, dict]:
  if not MANIFEST_SOURCE.exists():
    return {}

  overrides: dict[str, dict] = {}
  with MANIFEST_SOURCE.open("r", encoding="utf-8") as f:
    for line in f:
      line = line.strip()
      if not line:
        continue
      row = json.loads(line)
      image_name = Path(row["image"]).name
      overrides[image_name] = row
  return overrides


def collect_image_samples() -> list[dict[str, object]]:
  overrides = load_manifest_overrides()
  samples: list[dict[str, object]] = []

  if not RAW_DIR.exists():
    RAW_DIR.mkdir(parents=True, exist_ok=True)

  for image_path in sorted(RAW_DIR.rglob("*")):
    if not image_path.is_file() or image_path.suffix.lower() not in IMAGE_EXTENSIONS:
      continue

    override = overrides.get(image_path.name, {})
    caption, metadata = read_caption(image_path)
    caption = str(override.get("caption", caption)).strip()
    if not caption:
      continue

    rel_image = image_path.relative_to(ROOT).as_posix()
    tags = override.get("tags", metadata.get("tags", []))
    trigger_word = override.get("trigger_word", metadata.get("trigger_word", "aileena_style"))

    samples.append(
      {
        "image": rel_image,
        "caption": caption,
        "trigger_word": trigger_word,
        "tags": tags,
        "source": image_path.name,
      }
    )

  return samples


def write_jsonl(path: Path, rows: list[dict[str, object]]) -> None:
  path.parent.mkdir(parents=True, exist_ok=True)
  with path.open("w", encoding="utf-8") as f:
    for row in rows:
      f.write(json.dumps(row, ensure_ascii=False) + "\n")


def prepare_image_training_data() -> int:
  samples = collect_image_samples()
  write_jsonl(OUTPUT_JSONL, samples)

  # Diffusion-friendly metadata format: "caption image_path"
  metadata_rows = [
    {"file_name": row["image"], "text": f"{row['trigger_word']}, {row['caption']}"}
    for row in samples
  ]
  write_jsonl(OUTPUT_METADATA, metadata_rows)

  print(f"Prepared {len(samples)} image samples -> {OUTPUT_JSONL}")
  if len(samples) == 0:
    print("No images found. Add files to training_data/images/raw/ and captions in training_data/images/captions/")
  return len(samples)


def main() -> None:
  parser = argparse.ArgumentParser(description="Prepare image LoRA datasets")
  parser.parse_args()
  prepare_image_training_data()


if __name__ == "__main__":
  main()
