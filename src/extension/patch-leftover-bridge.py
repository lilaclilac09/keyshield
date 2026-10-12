#!/usr/bin/env python3
"""Leftover 1.2.4: restore session-bridge.js. No HTML. No git required."""
from __future__ import annotations

import json
import shlex
import sys
from pathlib import Path

NAME = "KeyShield — Sovereign Vault"
VER = "1.2.4"
SKIP = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", "Library", "AppData"}
WALK = ("Downloads", "Documents", "Desktop", "src", "code", "dev", "work", "privacy_hack")
CHROME = (
    "Library/Application Support/Google/Chrome",
    "Library/Application Support/Google/Chrome Beta",
    "Library/Application Support/Google/Chrome Canary",
    "Library/Application Support/Chromium",
    "Library/Application Support/Microsoft Edge",
    "Library/Application Support/BraveSoftware/Brave-Browser",
    "Library/Application Support/Arc/User Data",
    ".config/google-chrome",
    ".config/chromium",
    ".config/microsoft-edge",
    ".config/BraveSoftware/Brave-Browser",
    "snap/chromium/common/chromium",
)
BRIDGE_JS = (
    "(function keyShieldSessionBridge(){"
    "function announce(){if(typeof chrome==='undefined'||!chrome.runtime||!chrome.runtime.id)return;"
    "try{window.postMessage({__ks_ext_announce:chrome.runtime.id},location.origin)}catch(e){}}"
    "function readPage(){try{return{token:localStorage.getItem('ks_token')||'',"
    "user:localStorage.getItem('ks_wallet')||localStorage.getItem('ks_passkey_user')||''}}"
    "catch(e){return{token:'',user:''}}}"
    "function capturePageToken(){if(typeof chrome==='undefined'||!chrome.storage||!chrome.storage.local)return;"
    "var p=readPage();if(!p.token||p.token.trim().length<12)return;"
    "chrome.storage.local.get(['ks_token'],function(s){if(s&&s.ks_token===p.token)return;"
    "chrome.storage.local.set({ks_token:p.token,ks_user:p.user||null,ks_auto_store:true})})}"
    "function share(){if(typeof chrome==='undefined'||!chrome.storage||!chrome.storage.local)return;"
    "capturePageToken();chrome.storage.local.get(['ks_token','ks_user'],function(s){"
    "var t=s&&s.ks_token;if(!t)return;try{if(!localStorage.getItem('ks_token'))localStorage.setItem('ks_token',t)}"
    "catch(e){}try{window.postMessage({__ks_ext_session:{token:t,user:s.ks_user||null}},location.origin)}catch(e){}})}"
    "announce();share();capturePageToken();"
    "[400,1200,3000,8000].forEach(function(ms){setTimeout(capturePageToken,ms)});"
    "window.addEventListener('ks-auth-changed',capturePageToken);"
    "window.addEventListener('storage',capturePageToken);"
    "window.addEventListener('message',function(e){if(e.source!==window||!e.data)return;"
    "if(e.data.__ks_ext_request)announce();if(e.data.__ks_ext_request_session)share();"
    "if(e.data.__ks_page_session||e.data.__ks_auth_changed)capturePageToken()});"
    "})();\n"
)
CONTENT_SCRIPTS = [
    {
        "matches": [
            "https://app.ks.aileena.xyz/*",
            "https://*.aileena.xyz/*",
            "https://keyshield.dev/*",
            "https://*.keyshield.dev/*",
            "https://*.up.railway.app/*",
            "https://*.vercel.app/*",
            "http://127.0.0.1:5173/*",
            "http://localhost:5173/*",
            "http://127.0.0.1:3000/*",
            "http://localhost:3000/*",
        ],
        "js": ["session-bridge.js"],
        "run_at": "document_start",
    },
    {"matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle", "all_frames": True},
]


def looks_ext(path: Path) -> bool:
    return (path / "manifest.json").is_file() and (path / "popup.js").is_file()


def keyshield_name(path: Path) -> bool:
    try:
        name = str(json.loads((path / "manifest.json").read_text(encoding="utf-8")).get("name") or "")
    except Exception:
        return False
    return "KeyShield" in name or "Sovereign Vault" in name


def repo_root(ext: Path) -> Path:
    if ext.name == "extension" and ext.parent.name == "src":
        return ext.parent.parent
    if ext.name == "extension":
        return ext.parent
    return ext


def walk(root: Path, max_depth: int = 5):
    if not root.is_dir():
        return
    stack = [(root, 0)]
    while stack:
        path, depth = stack.pop()
        if depth > max_depth:
            continue
        try:
            kids = list(path.iterdir())
        except OSError:
            continue
        names = {child.name for child in kids}
        if "manifest.json" in names and "popup.js" in names:
            yield path
            continue
        if depth == max_depth:
            continue
        for child in kids:
            if child.is_dir() and child.name not in SKIP and not child.name.startswith("."):
                stack.append((child, depth + 1))


def collect_hits() -> list[tuple[str, Path]]:
    hits: list[tuple[str, Path]] = []
    here = Path.cwd().resolve()
    for parent in (here, *here.parents):
        for cand in (parent / "src/extension", parent, parent / "extension"):
            if looks_ext(cand) and keyshield_name(cand):
                hits.append(("cwd", cand))
    home = Path.home()
    for rel in CHROME:
        base = home / rel
        if not base.is_dir():
            continue
        for pref in base.glob("*/Preferences"):
            try:
                data = json.loads(pref.read_text(encoding="utf-8"))
            except Exception:
                continue
            settings = (data.get("extensions") or {}).get("settings") or {}
            if not isinstance(settings, dict):
                continue
            for row in settings.values():
                if not isinstance(row, dict):
                    continue
                raw = row.get("path")
                if not raw or not isinstance(raw, str):
                    continue
                cand = Path(raw).expanduser()
                if cand.is_absolute() and looks_ext(cand) and keyshield_name(cand):
                    hits.append(("chrome-internals", cand))
    for rel in WALK:
        for cand in walk(home / rel):
            if keyshield_name(cand):
                hits.append(("walk", cand))
    seen: set[Path] = set()
    ordered: list[tuple[str, Path]] = []
    rank = {"cwd": 0, "chrome-internals": 1, "walk": 2}
    for src, path in hits:
        try:
            resolved = path.resolve()
        except OSError:
            continue
        if resolved in seen or not looks_ext(resolved):
            continue
        seen.add(resolved)
        ordered.append((src, resolved))
    ordered.sort(key=lambda item: rank.get(item[0], 9))
    return ordered


def find_ext() -> Path:
    hits = collect_hits()
    if not hits:
        raise SystemExit(
            "no KeyShield folder (Chrome internals + home walk + cwd). "
            "chrome://extensions → Details → Loaded from, then run from that folder."
        )
    return hits[0][1]


def print_find(hits: list[tuple[str, Path]], ext: Path) -> None:
    for src, path in hits:
        ver = ""
        try:
            ver = str(json.loads((path / "manifest.json").read_text(encoding="utf-8")).get("version") or "")
        except Exception:
            pass
        print("#", src, path, "v" + ver)
    print("export KS_ROOT=" + shlex.quote(str(repo_root(ext))))
    print("export KS_EXT=" + shlex.quote(str(ext)))


def has_bridge(man: dict) -> bool:
    for row in man.get("content_scripts") or []:
        if isinstance(row, dict) and "session-bridge.js" in (row.get("js") or []):
            return True
    return False


def stamp(ext: Path) -> dict:
    path = ext / "manifest.json"
    man = json.loads(path.read_text())
    man["name"] = NAME
    man["version"] = VER
    man.setdefault("optional_host_permissions", [])
    if "<all_urls>" not in man["optional_host_permissions"]:
        man["optional_host_permissions"].append("<all_urls>")
    man.setdefault("host_permissions", [])
    if "<all_urls>" not in man["host_permissions"]:
        man["host_permissions"].insert(0, "<all_urls>")
    for extra in ("scripting", "tabs"):
        if extra not in man.get("permissions", []):
            man.setdefault("permissions", []).append(extra)
    man["content_scripts"] = CONTENT_SCRIPTS
    dest = ext / "session-bridge.js"
    if (not dest.is_file()) or ("capturePageToken" not in dest.read_text(encoding="utf-8")):
        dest.write_text(BRIDGE_JS)
    path.write_text(json.dumps(man, indent=2) + "\n")
    return man


def main(argv: list[str] | None = None) -> None:
    args = argv if argv is not None else sys.argv[1:]
    hits = collect_hits()
    if not hits:
        raise SystemExit(
            "no KeyShield folder (Chrome internals + home walk + cwd). "
            "chrome://extensions → Details → Loaded from, then run from that folder."
        )
    ext = hits[0][1]
    if "--find" in args:
        print_find(hits, ext)
        return
    last = {}
    for src, path in hits:
        last = stamp(path)
        print("stamped", src, path, "session-bridge", has_bridge(last))
    print("ok", ext)
    print("name", last.get("name", NAME))
    print("ver", last.get("version", VER))
    print("session-bridge", has_bridge(last) if last else False)
    print("file", (ext / "session-bridge.js").is_file())
    print("hits", len(hits))
    print("next: chrome://extensions → Remove → Load unpacked", ext)
    print("then refresh https://app.ks.aileena.xyz and reopen popup")


if __name__ == "__main__":
    main()
