#!/usr/bin/env python3
"""Print the KeyShield 1.2.5 Load unpacked folder from any cwd.

Works from $HOME. Does not run git. Does not use shell command substitution.
Seeing Sovereign Vault / 1.2.5 on the Chrome card is not enough if a leftover
card is still loaded or the toolbar popup has no default_popup.
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


def verdict(man: dict) -> str:
    version = str(man.get("version") or "")
    popup = popup_name(man)
    urls = has_all_urls(man)
    name = str(man.get("name") or "")
    if name != WANT_NAME:
        return f"NOT READY — name {name!r} (want {WANT_NAME})"
    if version == WANT_VER and popup == "popup.html" and urls:
        return f"READY {WANT_VER}"
    if version == "1.2.4":
        extra = "" if popup else " — leftover stamp missing default_popup"
        return f"LEFTOVER 1.2.4 — Remove every card, Load unpacked {WANT_VER}{extra}"
    missing = []
    if not popup:
        missing.append("default_popup")
    if not urls:
        missing.append("<all_urls>")
    if version != WANT_VER:
        missing.append(f"version {version}")
    return "NOT READY — " + ", ".join(missing)


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
                found.append(
                    {
                        "path": path,
                        "version": str(mm.get("version") or ""),
                        "popup": popup_name(mm) or "MISSING",
                        "all_urls": has_all_urls(mm),
                    }
                )
    return found


def probe_health() -> str:
    try:
        with urlopen(HEALTH, timeout=2) as resp:
            body = resp.read(200).decode("utf-8", "replace")
            return f"health {resp.status} {body}"
    except (URLError, TimeoutError, OSError) as exc:
        return f"health skip {type(exc).__name__}"


def report_lines(root: Path) -> list[str]:
    ext = (root / "src" / "extension").resolve()
    man = read_manifest(ext)
    cards = chrome_unpacked()
    lines = [
        str(man.get("name") or ""),
        str(man.get("version") or ""),
        str(ext),
        popup_name(man) or "MISSING",
        "<all_urls>" if has_all_urls(man) else "missing <all_urls>",
        verdict(man),
    ]
    if cards:
        lines.append("chrome cards " + str(len(cards)))
        for card in cards:
            lines.append(
                "chrome {version} popup={popup} {urls} {path}".format(
                    version=card["version"],
                    popup=card["popup"],
                    urls="<all_urls>" if card["all_urls"] else "no-all-urls",
                    path=card["path"],
                )
            )
            if card["version"] != WANT_VER or card["popup"] == "MISSING":
                lines.append(
                    "chrome leftover — Remove this card too, then Load unpacked "
                    + str(ext)
                )
    else:
        lines.append("chrome cards none scanned")
    lines.extend(
        [
            "next: chrome://extensions → Remove every KeyShield card → Load unpacked the folder above",
            "toolbar: " + READY_LINE,
            "latest: " + LATEST_LINE,
            "sign-in: " + HOSTED,
            probe_health(),
        ]
    )
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
    sys.stdout.write("\n".join(report_lines(root)) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
