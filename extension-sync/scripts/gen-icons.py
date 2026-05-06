#!/usr/bin/env python3
"""
Generate KeyShield extension icons (16/48/128 px) into src/icons/.

Run once after design changes:

    python3 scripts/gen-icons.py

The build script reads the produced PNGs verbatim into dist/icons/.
A single command — no PIL dependency for everyone, just whoever
actually edits the icon.

Design: KeyShield brand purple (#6627ff) shield silhouette with a
white "K" centered. The shape is a rounded rectangle approximation
of a shield — good enough for the toolbar at 16px.
"""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

PURPLE = (102, 39, 255, 255)  # #6627ff brand
DEEP = (60, 20, 180, 255)     # darker rim
WHITE = (255, 255, 255, 255)

SIZES = (16, 48, 128)


def shield_path(size: int) -> list[tuple[int, int]]:
    """Return polygon points approximating a shield shape."""
    s = size
    pad = max(1, s // 16)
    top = pad
    side = pad
    bottom_curve = s - pad
    return [
        (side, top),
        (s - side, top),
        (s - side, int(s * 0.55)),
        (s // 2, bottom_curve),
        (side, int(s * 0.55)),
    ]


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pts = shield_path(size)
    draw.polygon(pts, fill=PURPLE, outline=DEEP)

    # Letter "K" — pick the largest font we can find.
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
    ]
    font = None
    for path in candidates:
        if os.path.exists(path):
            try:
                font = ImageFont.truetype(path, max(8, int(size * 0.55)))
                break
            except Exception:
                continue
    if font is None:
        font = ImageFont.load_default()

    text = "K"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = int(size * 0.42) - th // 2 - bbox[1]
    draw.text((tx, ty), text, font=font, fill=WHITE)
    return img


for sz in SIZES:
    img = draw_icon(sz)
    out = OUT / f"icon{sz}.png"
    img.save(out, "PNG", optimize=True)
    print(f"  wrote {out.relative_to(ROOT)} ({out.stat().st_size} bytes)")

print("\nDone. Commit src/icons/*.png so the build script can pick them up.")
