#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${ROOT_DIR}"

python3 prepare_training_data.py
python3 prepare_image_training_data.py

cat <<'EOF'
Training datasets are ready.

Text:
- training_data/text_all.jsonl
- training_data/memories.jsonl
- training_data/articles.jsonl
- training_data/reflections.jsonl

Images:
- training_data/images/images.jsonl
- training_data/images/metadata.jsonl

Next:
- Text LoRA: accelerate launch -m axolotl.cli.train lora_config.yaml
- Image LoRA: accelerate launch -m axolotl.cli.train image_lora_config.yaml
EOF
