#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

python3 prepare_image_training_data.py

EXPORT_DIR="${ROOT_DIR}/training_data/images/kohya_export"
mkdir -p "${EXPORT_DIR}"

python3 - <<'PY'
import json
import shutil
from pathlib import Path

root = Path(".")
export_dir = root / "training_data/images/kohya_export"
metadata = root / "training_data/images/metadata.jsonl"

if not metadata.exists():
    raise SystemExit("metadata.jsonl not found. Run prepare_image_training_data.py first.")

count = 0
with metadata.open("r", encoding="utf-8") as f:
    for line in f:
        row = json.loads(line)
        src = root / row["file_name"]
        if not src.exists():
            continue
        dst = export_dir / src.name
        shutil.copy2(src, dst)
        (export_dir / f"{src.stem}.txt").write_text(row["text"] + "\n", encoding="utf-8")
        count += 1

print(f"Exported {count} image-caption pairs -> {export_dir}")
PY
