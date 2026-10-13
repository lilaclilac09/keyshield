#!/usr/bin/env python3
"""Print and restore the KeyShield 1.2.5 Load unpacked folder from any cwd.

Works from $HOME. Does not run git. Does not use shell command substitution.

The leftover patch writes version 1.2.4 onto every hit, including
src/extension. Chrome then shows 1.2.4 after Load unpacked. This script
writes 1.2.5 back onto the product folder only. Leftover-only copies stay 1.2.4.

The footer must not print toolbar 1.2.5 unless the folder on disk is 1.2.5.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

MAC_ROOT = Path("/Users/aileen/Downloads/privacy_hack/keyshield")
WANT_NAME = "KeyShield — Sovereign Vault"
WANT_VER = "1.2.5"
LEFTOVER_VER = "1.2.4"
READY_LINE = "ok 1.2.5 <all_urls>"
LATEST_LINE = "1.2.5 · latest"
HOSTED = "https://app.ks.aileena.xyz/?ext=1&demo=shop"
HEALTH = os.environ.get("KS_BASE", "http://127.0.0.1:8001").rstrip("/") + "/health"


def _script_root() -> Path | None:
    f = globals().get("__file__")
    if not f or f in ("<stdin>", "-"):
        return None
    return Path(f).resolve().parent.parent


def _looks_root(path: Path) -> bool:
    return (path / "src" / "extension" / "manifest.json").is_file()


def candidate_roots() -> list[Path]:
    out: list[Path] = []
    env = os.environ.get("KS_ROOT", "").strip()
    if env:
        out.append(Path(env).expanduser())
    out.append(MAC_ROOT)
    script = _script_root()
    if script is not None:
        out.append(script)
    cwd = Path.cwd()
    out.extend(
        [
            cwd,
            cwd.parent,
            Path.home() / "Downloads" / "privacy_hack" / "keyshield",
            Path.home() / "Downloads" / "keyshield",
        ]
    )
    seen: set[Path] = set()
    unique: list[Path] = []
    for item in out:
        try:
            key = item.resolve() if item.exists() else item
        except OSError:
            key = item
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def find_root() -> tuple[Path | None, list[str]]:
    tried: list[str] = []
    for path in candidate_roots():
        tried.append(str(path))
        try:
            if _looks_root(path):
                return path.resolve(), tried
        except OSError:
            continue
    return None, tried


def read_manifest(ext: Path) -> dict:
    return json.loads((ext / "manifest.json").read_text())


def popup_name(man: dict) -> str:
    action = man.get("action") or {}
    return str(action.get("default_popup") or "")


def has_all_urls(man: dict) -> bool:
    hosts = list(man.get("host_permissions") or []) + list(
        man.get("optional_host_permissions") or []
    )
    return "<all_urls>" in hosts


def is_product_ext(ext: Path) -> bool:
    try:
        ext = ext.resolve()
    except OSError:
        return False
    if ext == (MAC_ROOT / "src" / "extension"):
        return True
    return (
        ext.name == "extension"
        and ext.parent.name == "src"
        and (ext.parent.parent / "src" / "web").is_dir()
        and (ext / "manifest.json").is_file()
    )


def verdict(man: dict) -> str:
    version = str(man.get("version") or "")
    popup = popup_name(man)
    urls = has_all_urls(man)
    name = str(man.get("name") or "")
    if name != WANT_NAME:
        return f"NOT READY — name {name!r} (want {WANT_NAME})"
    if version == WANT_VER and popup == "popup.html" and urls:
        return f"READY {WANT_VER}"
    if version == LEFTOVER_VER:
        extra = "" if popup else " — leftover stamp missing default_popup"
        return f"LEFTOVER {LEFTOVER_VER} — do not Load unpacked this folder{extra}"
    missing = []
    if not popup:
        missing.append("default_popup")
    if not urls:
        missing.append("<all_urls>")
    if version != WANT_VER:
        missing.append(f"version {version}")
    return "NOT READY — " + ", ".join(missing)


def restore_product(ext: Path) -> dict:
    """Write 1.2.5 + default_popup onto the product folder only."""
    if not is_product_ext(ext):
        return {"changed": False, "skipped": "not product src/extension"}
    path = ext / "manifest.json"
    man = read_manifest(ext)
    before = str(man.get("version") or "")
    need = (
        before != WANT_VER
        or str(man.get("name") or "") != WANT_NAME
        or popup_name(man) != "popup.html"
        or not has_all_urls(man)
    )
    changed = False
    if need:
        man["name"] = WANT_NAME
        man["version"] = WANT_VER
        action = man.get("action")
        if not isinstance(action, dict):
            action = {}
        action["default_popup"] = "popup.html"
        action["default_title"] = WANT_NAME
        man["action"] = action
        man.setdefault("optional_host_permissions", [])
        if "<all_urls>" not in man["optional_host_permissions"]:
            man["optional_host_permissions"].insert(0, "<all_urls>")
        man.setdefault("host_permissions", [])
        if "<all_urls>" not in man["host_permissions"]:
            man["host_permissions"].insert(0, "<all_urls>")
        path.write_text(json.dumps(man, indent=2, ensure_ascii=False) + "\n")
        changed = True
    html_path = ext / "popup.html"
    if html_path.is_file():
        html = html_path.read_text(encoding="utf-8")
        new_html = html.replace("ok 1.2.4", "ok 1.2.5")
        if "1.2.5 · latest" not in new_html and "ext-latest" in new_html:
            new_html = new_html.replace("1.2.4 · latest", "1.2.5 · latest")
        if new_html != html:
            html_path.write_text(new_html)
            changed = True
    js_path = ext / "popup.js"
    if js_path.is_file():
        js = js_path.read_text(encoding="utf-8")
        new_js = js
        if 'ver === "1.2.5"' not in js and 'ver==="1.2.5"' not in js:
            new_js = new_js.replace(
                'ver === "1.2.4"', '(ver === "1.2.5" || ver === "1.2.4")'
            )
            new_js = new_js.replace(
                'ver==="1.2.4"', '(ver==="1.2.5"||ver==="1.2.4")'
            )
        if new_js != js:
            js_path.write_text(new_js)
            changed = True
    return {"changed": changed, "before": before, "after": WANT_VER, "path": str(ext)}


def chrome_unpacked() -> list[dict]:
    bases = [
        Path.home() / "Library/Application Support/Google/Chrome",
        Path.home() / "Library/Application Support/Arc/User Data",
        Path.home() / "Library/Application Support/Chromium",
        Path.home() / "Library/Application Support/Microsoft Edge",
    ]
    found: list[dict] = []
    seen: set[str] = set()
    for base in bases:
        if not base.is_dir():
            continue
        for pref in base.glob("*/Preferences"):
            try:
                data = json.loads(pref.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            settings = (data.get("extensions") or {}).get("settings") or {}
            if not isinstance(settings, dict):
                continue
            for row in settings.values():
                if not isinstance(row, dict):
                    continue
                path = str(row.get("path") or "")
                if not path or path in seen:
                    continue
                man_path = Path(path) / "manifest.json"
                if not man_path.is_file():
                    continue
                try:
                    mm = json.loads(man_path.read_text())
                except (OSError, json.JSONDecodeError):
                    continue
                name = str(mm.get("name") or "")
                if "KeyShield" not in name and "Sovereign" not in name:
                    continue
                seen.add(path)
                found.append(_folder_row(Path(path), mm))
    return found


def _folder_row(ext: Path, man: dict | None = None) -> dict:
    if man is None:
        try:
            man = read_manifest(ext)
        except (OSError, json.JSONDecodeError):
            man = {}
    version = str(man.get("version") or "")
    product = is_product_ext(ext)
    return {
        "path": str(ext),
        "version": version,
        "popup": popup_name(man) or "MISSING",
        "all_urls": has_all_urls(man),
        "product": product,
        "load": product and version == WANT_VER,
    }


def guess_ext_folders(product: Path | None) -> list[Path]:
    hits: list[Path] = []
    if product is not None:
        hits.append(product)
    guesses = [
        MAC_ROOT / "src" / "extension",
        Path.home() / "Downloads" / "privacy_hack" / "keyshield" / "src" / "extension",
        Path.cwd() / "src" / "extension",
    ]
    downs = Path.home() / "Downloads"
    if downs.is_dir():
        guesses.extend(p.parent for p in downs.glob("*/src/extension/manifest.json"))
        guesses.extend(p.parent for p in downs.glob("*/*/src/extension/manifest.json"))
        guesses.extend(p.parent for p in downs.glob("*/extension/manifest.json"))
    seen: set[Path] = set()
    out: list[Path] = []
    for ext in hits + guesses:
        try:
            key = ext.resolve()
        except OSError:
            continue
        if key in seen or not (key / "manifest.json").is_file():
            continue
        seen.add(key)
        out.append(key)
    return out


def probe_health() -> str:
    try:
        with urlopen(HEALTH, timeout=2) as resp:
            body = resp.read(200).decode("utf-8", "replace")
            return f"health {resp.status} {body}"
    except (URLError, TimeoutError, OSError) as exc:
        return f"health skip {type(exc).__name__}"


def report_lines(root: Path, restored: dict | None = None) -> list[str]:
    ext = (root / "src" / "extension").resolve()
    man = read_manifest(ext)
    ready = verdict(man)
    lines = [
        str(man.get("name") or ""),
        str(man.get("version") or ""),
        str(ext),
        popup_name(man) or "MISSING",
        "<all_urls>" if has_all_urls(man) else "missing <all_urls>",
        ready,
    ]
    if restored:
        if restored.get("changed"):
            lines.append(
                "restored {before} -> {after} {path}".format(
                    before=restored.get("before"),
                    after=restored.get("after"),
                    path=restored.get("path"),
                )
            )
        elif restored.get("skipped"):
            lines.append("restore skip " + str(restored.get("skipped")))
        else:
            lines.append("already " + WANT_VER)
    folders = [_folder_row(path) for path in guess_ext_folders(ext)]
    lines.append("folders " + str(len(folders)))
    for row in folders:
        tag = "LOAD THIS" if row["load"] else (
            "skip leftover" if row["version"] == LEFTOVER_VER else "skip"
        )
        lines.append(
            "folder {version} popup={popup} {tag} {path}".format(
                version=row["version"],
                popup=row["popup"],
                tag=tag,
                path=row["path"],
            )
        )
    cards = chrome_unpacked()
    if cards:
        lines.append("chrome cards " + str(len(cards)))
        for card in cards:
            lines.append(
                "chrome {version} popup={popup} {path}".format(
                    version=card["version"],
                    popup=card["popup"],
                    path=card["path"],
                )
            )
            if card["version"] != WANT_VER:
                lines.append("chrome still " + LEFTOVER_VER + " — Remove this card")
    else:
        lines.append("chrome cards none scanned")
    lines.append("do not run patch-leftover-bridge.py on src/extension — that writes 1.2.4")
    if ready == f"READY {WANT_VER}":
        lines.extend(
            [
                "LOAD UNPACKED ONLY " + str(ext),
                "next: chrome://extensions → Remove every KeyShield card → Load unpacked ONLY the folder above",
                "after that Chrome card must say 1.2.5 — if it still says 1.2.4 you loaded leftover",
                "toolbar then: " + READY_LINE,
                "latest then: " + LATEST_LINE,
                "sign-in: " + HOSTED,
            ]
        )
    else:
        lines.extend(
            [
                "DO NOT Load unpacked a 1.2.4 folder — Chrome card will stay 1.2.4",
                "fix the product src/extension first, then Remove every card",
            ]
        )
    lines.append(probe_health())
    return lines


def main() -> int:
    root, tried = find_root()
    if root is None:
        sys.stderr.write("NO CLONE. Tried:\n")
        for item in tried:
            sys.stderr.write("  " + item + "\n")
        sys.stderr.write(
            "Set KS_ROOT to the keyshield folder, or keep the clone at "
            + str(MAC_ROOT)
            + "\n"
        )
        return 1
    ext = (root / "src" / "extension").resolve()
    restored = restore_product(ext)
    sys.stdout.write("\n".join(report_lines(root, restored)) + "\n")
    man = read_manifest(ext)
    return 0 if verdict(man) == f"READY {WANT_VER}" else 2


if __name__ == "__main__":
    raise SystemExit(main())
