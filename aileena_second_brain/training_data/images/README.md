# Image Training Data

Put training images here:

```text
training_data/images/raw/<your-image>.png
training_data/images/captions/<your-image>.md
```

## Caption file format

`captions/example.md`:

```markdown
---
trigger_word: aileena_style
tags: [portrait, workflow]
---
A clean illustration of an AI assistant planning tasks with markdown memory files.
```

## Optional manifest override

`manifest.source.jsonl`:

```json
{"image": "raw/example.png", "caption": "Aileena style icon with second brain folders", "trigger_word": "aileena_style", "tags": ["icon"]}
```

## Build dataset

```bash
python3 prepare_image_training_data.py
```

Outputs:
- `images.jsonl` (generic multimodal format)
- `metadata.jsonl` (diffusion trainer format)
