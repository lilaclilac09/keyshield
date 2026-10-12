#!/usr/bin/env python3
"""Offline 1.2.1 → 1.2.4 signed-in popup. No git. Do not paste HTML into zsh."""
from __future__ import annotations

import json
import shlex
import sys
from pathlib import Path

NAME = "KeyShield — Sovereign Vault"
VER = "1.2.4"
HOSTED = "https://app.ks.aileena.xyz"
MARK_JS = "/* KS-SIGNED-1.2.4 */"
MARK_BG = "/* KS-LIST-SAVED-1.2.4 */"

HTML = """<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>KeyShield</title>
<style>
body{width:280px;margin:0;padding:14px 16px;background:#0a0d1a;color:#e4e4e7;font:13px/1.45 -apple-system,system-ui,sans-serif;word-spacing:.06em}
h1{margin:0 0 10px;font-size:14px;font-weight:600;word-spacing:.08em}
button{display:block;width:100%;margin:0 0 10px;padding:10px 12px;background:#5b8cff;color:#fff;border:1px solid #5b8cff;border-radius:8px;font-size:13px;word-spacing:.08em}
button.secondary{background:transparent;color:#e4e4e7;border-color:#27272a}button.danger{background:transparent;color:#f87171;border-color:rgba(239,68,68,.3)}
.status{margin:0 0 10px;padding:7px 10px;border-radius:8px;font-size:12px;display:none}
.status.ok{display:block;background:rgba(16,185,129,.12);color:#34d399}
.status.err{display:block;background:rgba(239,68,68,.12);color:#f87171}
.saved-count{margin:0 0 10px;font-size:28px;font-weight:700}
.api-row{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;margin:0 0 8px;background:#020408;border:1px solid #1c2238;border-radius:8px}
.sub{margin:0 0 10px;color:#71717a;font-size:12px}
body.signed-in .guest-only{display:none!important}body:not(.signed-in) .signed-only{display:none!important}
body.signed-in #detect-ready{display:none!important}.extra{display:none!important}
</style></head>
<body data-ui="three-line">
<h1>KeyShield — Sovereign Vault</h1>
<div id="detect-ready" class="status" style="display:block">ok 1.2.4 &lt;all_urls&gt;</div>
<div id="signed-pane" class="signed-only"><p id="saved-count" class="saved-count">0 saved</p><div id="saved-apis"></div><p id="saved-empty" class="sub">None yet. Detect stays on.</p><button id="clear-top" class="danger">Sign out</button></div>
<button id="signin" class="guest-only">Sign in to KeyShield</button>
<button id="allow-detect" class="secondary guest-only">Allow detect + auto-save</button>
<div id="status" class="status"></div>
<div class="extra" hidden><span id="conn"></span><div id="build"></div><button id="fill-tab"></button><button id="copy-cursor-key"></button><button id="use-hosted-top"></button><textarea id="manual"></textarea><button id="register"></button><button id="clear"></button><input id="api"/><input id="dash"/><button id="save"></button><div id="fingerprint"></div><input id="remote"/><button id="point-remote"></button><button id="point-local"></button><button id="point-prod"></button><button id="export-vault"></button><input id="import-file" type="file"/><button id="import-vault"></button><div id="backup-status"></div><button id="fill-tab-signed"></button><button id="copy-cursor-key-signed"></button></div>
<script src="popup.js"></script></body></html>
"""

JS = r"""
/* KS-SIGNED-1.2.4 */
function summarizeSavedApis(data) {
  const rows = Array.isArray(data) ? data
    : data && Array.isArray(data.items) ? data.items
    : data && Array.isArray(data.keys) ? data.keys : [];
  const out = [];
  for (const it of rows) {
    if (!it || typeof it !== "object") continue;
    const upstream = String(it.upstream || "").toLowerCase().trim();
    if (!upstream) continue;
    let masked = String(it.masked_value || "").trim();
    if (!masked) masked = it.cipher ? "encrypted" : "saved";
    out.push({ id: String(it.id || upstream), upstream, name: String(it.name || upstream + " key"), masked });
  }
  return out;
}
function applySignedInChrome(signed) {
  try { document.body.classList.toggle("signed-in", !!signed); } catch (e) {}
}
function formatSavedCount(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count === 1 ? "1 saved" : count + " saved";
}
function paintSavedCount(n) {
  const label = formatSavedCount(n);
  const hero = document.getElementById("saved-count");
  if (hero) hero.textContent = label;
  const badge = document.getElementById("conn");
  if (badge && document.body.classList.contains("signed-in")) badge.textContent = label;
}
async function harvestTokenFromDashboardTabs() {
  if (!chrome.scripting || !chrome.tabs) return null;
  let tabs = [];
  try { tabs = await chrome.tabs.query({ url: ["https://app.ks.aileena.xyz/*", "https://*.aileena.xyz/*", "http://127.0.0.1:5173/*", "http://localhost:5173/*"] }); }
  catch (e) { try { tabs = await chrome.tabs.query({}); } catch (e2) { return null; } }
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !/ks\.aileena\.xyz|127\.0\.0\.1:5173|localhost:5173/.test(tab.url)) continue;
    try {
      const injected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => ({ token: localStorage.getItem("ks_token") || "", user: localStorage.getItem("ks_wallet") || localStorage.getItem("ks_passkey_user") || "" }),
      });
      const result = injected && injected[0] && injected[0].result;
      if (result && String(result.token || "").trim().length >= 12) {
        await chrome.storage.local.set({ ks_token: result.token, ks_user: result.user || null, ks_auto_store: true });
        return result.token;
      }
    } catch (e) {}
  }
  return null;
}
async function refreshSavedApis() {
  const box = document.getElementById("saved-apis");
  const empty = document.getElementById("saved-empty");
  let resp = { apis: [] };
  try { resp = await chrome.runtime.sendMessage({ type: "LIST_SAVED_APIS" }); } catch (e) {}
  const apis = resp && Array.isArray(resp.apis) ? resp.apis : [];
  if (box) {
    box.replaceChildren();
    for (const api of apis) {
      const row = document.createElement("div");
      row.className = "api-row";
      const name = document.createElement("strong");
      name.textContent = api.upstream;
      const mask = document.createElement("code");
      mask.textContent = api.masked;
      row.append(name, mask);
      box.appendChild(row);
    }
  }
  if (empty) empty.style.display = apis.length ? "none" : "block";
  paintSavedCount(apis.length);
  return apis;
}
async function ksBootSignedPane() {
  try {
    let { ks_token } = await chrome.storage.local.get("ks_token");
    if (!ks_token || String(ks_token).trim().length < 12) {
      ks_token = await harvestTokenFromDashboardTabs();
    }
    applySignedInChrome(!!ks_token);
    if (ks_token) {
      try { await chrome.storage.local.set({ ks_auto_store: true }); } catch (e) {}
      try { await chrome.runtime.sendMessage({ type: "INJECT_DETECT" }); } catch (e) {}
      await refreshSavedApis();
    }
    const ready = document.getElementById("detect-ready");
    if (ready) {
      const ver = String((chrome.runtime.getManifest() || {}).version || "");
      let has = false;
      try { has = await chrome.permissions.contains({ origins: ["<all_urls>"] }); } catch (e) {}
      const ok = ver === "1.2.4" && has;
      ready.textContent = ok ? "ok 1.2.4 <all_urls>" : ("need Remove + Load unpacked · v" + (ver || "?"));
      ready.className = "status " + (ok ? "ok" : "err");
      ready.style.display = "block";
    }
    const build = document.getElementById("build");
    if (build) build.textContent = "v" + ((chrome.runtime.getManifest() || {}).version || "?") + " · KeyShield — Sovereign Vault";
  } catch (e) {}
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ksBootSignedPane);
else ksBootSignedPane();
"""

BG = r"""
/* KS-LIST-SAVED-1.2.4 */
function summarizeSavedApis(data) {
  const rows = Array.isArray(data) ? data
    : data && Array.isArray(data.items) ? data.items
    : data && Array.isArray(data.keys) ? data.keys : [];
  const out = [];
  for (const it of rows) {
    if (!it || typeof it !== "object") continue;
    const upstream = String(it.upstream || "").toLowerCase().trim();
    if (!upstream) continue;
    let masked = String(it.masked_value || "").trim();
    if (!masked) masked = it.cipher ? "encrypted" : "saved";
    out.push({ id: String(it.id || upstream), upstream, name: String(it.name || upstream + " key"), masked });
  }
  return out;
}
async function listSavedApis() {
  let token = "";
  let apiBase = "https://keyshield-production.up.railway.app";
  try {
    const s = await chrome.storage.local.get(["ks_token", "ks_api_base"]);
    token = s.ks_token || "";
    if (s.ks_api_base) apiBase = String(s.ks_api_base).replace(/\/+$/, "");
  } catch (e) {}
  if (!token) return { ok: false, reason: "no-token", apis: [] };
  try {
    const r = await fetch(apiBase + "/manage/vault", { headers: { Authorization: "Bearer " + token } });
    if (!r.ok) return { ok: false, reason: "http-" + r.status, apis: [] };
    return { ok: true, apis: summarizeSavedApis(await r.json()) };
  } catch (e) {
    return { ok: false, reason: "network", apis: [] };
  }
}
chrome.runtime.onMessage.addListener((message, _s, sendResponse) => {
  if (!message || message.type !== "LIST_SAVED_APIS") return;
  listSavedApis().then(sendResponse).catch((e) => sendResponse({ ok: false, apis: [], detail: String(e) }));
  return true;
});
"""


SKIP_DIRS = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", "Library", "AppData"}

CHROME_PREF_ROOTS = (
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

WALK_ROOTS = ("Downloads", "Documents", "Desktop", "src", "code", "dev", "work", "privacy_hack")


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


def walk_exts(root: Path, max_depth: int = 5):
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
            if child.is_dir() and child.name not in SKIP_DIRS and not child.name.startswith("."):
                stack.append((child, depth + 1))


def chrome_unpacked_exts() -> list[Path]:
    home = Path.home()
    found: list[Path] = []
    for rel in CHROME_PREF_ROOTS:
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
                if not cand.is_absolute() or not looks_ext(cand):
                    continue
                man = row.get("manifest") if isinstance(row.get("manifest"), dict) else {}
                name = str(man.get("name") or "")
                if name and "KeyShield" not in name and "Sovereign Vault" not in name:
                    if not keyshield_name(cand):
                        continue
                elif not name and not keyshield_name(cand):
                    continue
                found.append(cand)
    return found


def collect_hits() -> list[tuple[str, Path]]:
    hits: list[tuple[str, Path]] = []
    here = Path.cwd().resolve()
    for parent in (here, *here.parents):
        for cand in (parent / "src/extension", parent, parent / "extension"):
            if looks_ext(cand) and keyshield_name(cand):
                hits.append(("cwd", cand))
    for cand in chrome_unpacked_exts():
        hits.append(("chrome-internals", cand))
    home = Path.home()
    for rel in WALK_ROOTS:
        for cand in walk_exts(home / rel):
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


SESSION_BRIDGE_CONTENT_SCRIPT = {
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
}
DETECT_CONTENT_SCRIPT = {
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "run_at": "document_idle",
    "all_frames": True,
}


def manifest_has_session_bridge(man: dict) -> bool:
    for row in man.get("content_scripts") or []:
        if isinstance(row, dict) and "session-bridge.js" in (row.get("js") or []):
            return True
    return False


SESSION_BRIDGE_FALLBACK = r"""
(function keyShieldSessionBridge() {
  function announce() {
    if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.id) return;
    try { window.postMessage({ __ks_ext_announce: chrome.runtime.id }, location.origin); } catch (e) {}
  }
  function readPageSession() {
    try {
      return {
        token: localStorage.getItem("ks_token") || "",
        user: localStorage.getItem("ks_wallet") || localStorage.getItem("ks_passkey_user") || "",
      };
    } catch (e) {
      return { token: "", user: "" };
    }
  }
  function capturePageToken() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    var page = readPageSession();
    if (!page.token || page.token.trim().length < 12) return;
    chrome.storage.local.get(["ks_token"], function (stored) {
      if (stored && stored.ks_token === page.token) return;
      chrome.storage.local.set({ ks_token: page.token, ks_user: page.user || null, ks_auto_store: true });
    });
  }
  function shareSession() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;
    capturePageToken();
    chrome.storage.local.get(["ks_token", "ks_user"], function (stored) {
      var token = stored && stored.ks_token;
      try {
        if (stored && stored.ks_user) {
          if (!localStorage.getItem("ks_passkey_user")) localStorage.setItem("ks_passkey_user", stored.ks_user);
          if (!localStorage.getItem("ks_wallet")) localStorage.setItem("ks_wallet", stored.ks_user);
        }
      } catch (e) {}
      if (!token) return;
      try {
        if (!localStorage.getItem("ks_token")) {
          localStorage.setItem("ks_token", token);
          if (stored.ks_user) localStorage.setItem("ks_wallet", stored.ks_user);
        }
      } catch (e) {}
      try { window.postMessage({ __ks_ext_session: { token: token, user: stored.ks_user || null } }, location.origin); } catch (e) {}
    });
  }
  announce();
  shareSession();
  capturePageToken();
  [400, 1200, 3000, 8000].forEach(function (ms) { setTimeout(capturePageToken, ms); });
  window.addEventListener("ks-auth-changed", capturePageToken);
  window.addEventListener("storage", capturePageToken);
  window.addEventListener("message", function (e) {
    if (e.source !== window || !e.data) return;
    if (e.data.__ks_ext_request) announce();
    if (e.data.__ks_ext_request_session) shareSession();
    if (e.data.__ks_page_session || e.data.__ks_auth_changed) capturePageToken();
  });
})();
"""


def ensure_session_bridge_file(ext: Path) -> None:
    dest = ext / "session-bridge.js"
    if dest.is_file() and "capturePageToken" in dest.read_text(encoding="utf-8"):
        return
    here = globals().get("__file__")
    src = Path(here).resolve().parent / "session-bridge.js" if here else None
    if src and src.is_file() and src.resolve() != dest.resolve():
        dest.write_text(src.read_text(encoding="utf-8"))
        return
    dest.write_text(SESSION_BRIDGE_FALLBACK.lstrip() + "\n")


def stamp_manifest(ext: Path) -> None:
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
    man["content_scripts"] = [SESSION_BRIDGE_CONTENT_SCRIPT, DETECT_CONTENT_SCRIPT]
    ensure_session_bridge_file(ext)
    path.write_text(json.dumps(man, indent=2) + "\n")


def splice(path: Path, mark: str, block: str) -> None:
    text = path.read_text()
    if mark in text:
        text = text.split(mark)[0].rstrip() + "\n"
    path.write_text(text.rstrip() + "\n" + block.lstrip() + "\n")


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
    stamp_manifest(ext)
    html_path = ext / "popup.html"
    html_now = html_path.read_text() if html_path.exists() else ""
    compact = (
        'data-ui="three-line"' not in html_now
        or 'id="signed-pane"' not in html_now
        or 'id="saved-count"' not in html_now
        or 'id="saved-apis"' not in html_now
    )
    if compact:
        here = globals().get("__file__")
        sibling = Path(here).resolve().parent / "popup.html" if here else None
        if sibling and sibling.is_file() and 'data-ui="three-line"' in sibling.read_text(encoding="utf-8"):
            html_path.write_text(sibling.read_text(encoding="utf-8"))
        else:
            html_path.write_text(HTML)
    splice(ext / "popup.js", MARK_JS, JS)
    splice(ext / "background.js", MARK_BG, BG)
    man = json.loads((ext / "manifest.json").read_text())
    html = (ext / "popup.html").read_text()
    print("ok", ext)
    print("name", man["name"])
    print("ver", man["version"])
    print("signed-pane", 'id="signed-pane"' in html)
    print("saved-count", 'id="saved-count"' in html)
    print("three-line", 'data-ui="three-line"' in html)
    print("full-ui", 'data-ui="three-line"' in html and 'id="saved-apis"' in html)
    print("session-bridge", manifest_has_session_bridge(man))
    print("hosted", HOSTED)
    print("next: chrome://extensions → Remove → Load unpacked this folder")
    print("popup must say: ok 1.2.4 <all_urls>")
    print("if already signed: N saved + list + Sign out")


if __name__ == "__main__":
    main()
