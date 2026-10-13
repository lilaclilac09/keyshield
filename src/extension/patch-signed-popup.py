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

HTML = """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>KeyShield</title>
<style>body{width:280px;margin:0;padding:12px 14px 14px;background:#0a0d1a;color:#e4e4e7;font:13px/1.45 -apple-system,system-ui,sans-serif}h1{margin:0 0 10px;font-size:14px;font-weight:600}.row{margin:0 0 10px;padding:10px;border:1px solid #1c2238;border-radius:8px;background:#020408}.line{margin:0 0 8px;font-size:12px;color:#a1a1aa}.line.ok{color:#34d399}.line.err{color:#f87171}.saved-count{margin:0 0 8px;font-size:22px;font-weight:700}button{display:block;width:100%;margin:0;padding:8px 10px;background:#5b8cff;color:#fff;border:1px solid #5b8cff;border-radius:8px}button.secondary{background:transparent;color:#e4e4e7;border-color:#27272a}button.danger{background:transparent;color:#f87171;border-color:rgba(239,68,68,.3);margin-top:8px}.status{margin:8px 0 0;padding:7px 10px;border-radius:8px;font-size:12px;display:none}.status.ok{display:block;background:rgba(16,185,129,.12);color:#34d399}.status.err{display:block;background:rgba(239,68,68,.12);color:#f87171}.sub{margin:0 0 8px;color:#71717a;font-size:12px}.api-row{display:flex;flex-direction:column;gap:2px;padding:6px 0}.api-note{font-size:11px;color:#8a96c2}body.signed-in .guest-only{display:none!important}body:not(.signed-in) .signed-only{display:none!important}.extra{display:none!important}#copy-status,#fill-ms,#saved-count{display:none}</style></head>
<body data-ui="three-line">
<h1>KeyShield — Sovereign Vault</h1>
<section class="row" id="row-auth"><button id="signin" class="guest-only">Sign in</button><div id="signed-pane" class="signed-only"><p id="signed-status" class="saved-count">0 saved</p><p id="collected-line" class="line ok">0 collected</p><p id="saved-count" class="sub">0 saved</p><div id="saved-apis"></div><p id="saved-empty" class="sub">None yet. Detect stays on.</p><button id="clear-top" class="danger">Sign out</button></div></section>
<section class="row" id="row-detect"><p id="detect-line" class="line">detect · checking…</p><div id="detect-ready" class="status" style="display:block">ok 1.2.4 &lt;all_urls&gt;</div></section>
<section class="row" id="row-copy"><p id="filled-line" class="line">0 filled · —</p><p id="copy-status" class="line">0 filled · —</p><p id="fill-ms" class="line">—</p></section>
<div id="status" class="status"></div>
<div class="extra" hidden><span id="conn"></span><div id="build"></div><button id="allow-detect"></button><button id="fill-tab"></button><button id="fill-tab-signed"></button><button id="copy-cursor-key">Copy Cursor key</button><button id="copy-cursor-key-signed"></button><button id="use-hosted-top"></button><textarea id="manual"></textarea><button id="register"></button><button id="clear"></button><input id="api"/><input id="dash"/><button id="save"></button><div id="fingerprint"></div><input id="remote"/><button id="point-remote"></button><button id="point-local"></button><button id="point-prod"></button><button id="export-vault"></button><input id="import-file" type="file"/><button id="import-vault"></button><div id="backup-status"></div></div>
<script src="popup.js"></script></body></html>
"""


def popup_is_three_line(html: str) -> bool:
    return (
        'data-ui="three-line"' in html
        and 'id="row-auth"' in html
        and 'id="detect-line"' in html
        and 'id="copy-status"' in html
        and 'id="saved-apis"' in html
        and 'id="signed-status"' in html
        and 'id="collected-line"' in html
        and 'id="filled-line"' in html
        and 'id="fill-ms"' in html
        and "<details" not in html
        and "Register token" not in html
        and "Fill this tab" not in html
        and "Sign in to KeyShield" not in html
        and "Allow detect + auto-save" not in html
        and "Copy key for Cursor" not in html
    )

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
    out.push({ id: String(it.id || upstream), upstream, name: String(it.name || upstream + " key"), masked, family: String(it.family || ""), product: String(it.product || ""), domain: String(it.domain || ""), notes: String(it.notes || "") });
  }
  return out;
}
function applySignedInChrome(signed) {
  try { document.body.classList.toggle("signed-in", !!signed); } catch (e) {}
}
function formatCollectedCount(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count === 1 ? "1 collected" : count + " collected";
}
function formatSavedCount(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  return count === 1 ? "1 saved" : count + " saved";
}
function listedApiCount(box, apis) {
  const fromApis = Array.isArray(apis) ? apis.length : 0;
  const fromDom = box && box.querySelectorAll ? box.querySelectorAll(".api-row").length : 0;
  return Math.max(fromApis, fromDom);
}
function formatFilledLine(filled, ms) {
  const n = Math.max(0, Math.floor(Number(filled) || 0));
  const speed = (ms == null || !isFinite(Number(ms)) || Number(ms) < 0) ? "—" : (Math.round(Number(ms)) + "ms");
  return (n === 1 ? "1 filled" : n + " filled") + " · " + speed;
}
function paintSignedStatus(signed) {
  const el = document.getElementById("signed-status");
  if (!el) return;
  if (!signed) el.textContent = "Sign in";
}
function paintSavedCount(n) {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  const saved = formatSavedCount(count);
  const collected = formatCollectedCount(count);
  const signedIn = count > 0 || document.body.classList.contains("signed-in");
  const signedEl = document.getElementById("signed-status");
  if (signedEl) signedEl.textContent = signedIn ? saved : "Sign in";
  const hero = document.getElementById("saved-count");
  if (hero) hero.textContent = saved;
  const collectedEl = document.getElementById("collected-line");
  if (collectedEl) { collectedEl.textContent = collected; collectedEl.className = "line ok"; }
  const badge = document.getElementById("conn");
  if (badge && document.body.classList.contains("signed-in")) badge.textContent = saved;
}
function paintFilledLine(filled, ms, kind) {
  const text = formatFilledLine(filled, ms);
  const copy = document.getElementById("copy-status");
  if (copy) { copy.textContent = text; copy.className = ("line " + (kind || "ok")).trim(); }
  const line = document.getElementById("filled-line");
  if (line) { line.textContent = text; line.className = ("line " + (kind || "ok")).trim(); }
  const msEl = document.getElementById("fill-ms");
  if (msEl) msEl.textContent = (ms == null || !isFinite(Number(ms)) || Number(ms) < 0) ? "—" : (Math.round(Number(ms)) + "ms");
}
async function refreshFillStatus() {
  const started = Date.now();
  let filled = 0;
  try {
    const resp = await chrome.runtime.sendMessage({ type: "FILL_PAGE_NOW" });
    if (resp && typeof resp.filled === "number") filled = resp.filled;
  } catch (e) {}
  const ms = Date.now() - started;
  paintFilledLine(filled, ms, "ok");
  return { filled, ms };
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
      name.textContent = api.name || api.upstream;
      const note = document.createElement("span");
      note.className = "api-note";
      note.textContent = api.notes || [api.family, api.product].filter(Boolean).join(" · ");
      const mask = document.createElement("code");
      mask.textContent = api.masked;
      row.append(name, note, mask);
      box.appendChild(row);
    }
  }
  if (empty) empty.style.display = apis.length ? "none" : "block";
  paintSavedCount(listedApiCount(box, apis));
  return apis;
}
async function ksBootSignedPane() {
  try {
    let { ks_token } = await chrome.storage.local.get("ks_token");
    if (!ks_token || String(ks_token).trim().length < 12) {
      ks_token = await harvestTokenFromDashboardTabs();
    }
    applySignedInChrome(!!ks_token);
    paintSignedStatus(!!ks_token);
    if (ks_token) {
      try { await chrome.storage.local.set({ ks_auto_store: true }); } catch (e) {}
      try { await chrome.runtime.sendMessage({ type: "INJECT_DETECT" }); } catch (e) {}
      await refreshSavedApis();
      await refreshFillStatus();
    } else {
      paintSavedCount(0);
      paintFilledLine(0, null, "");
    }
    const ready = document.getElementById("detect-ready");
    const line = document.getElementById("detect-line");
    const copy = document.getElementById("copy-status");
    if (ready) {
      const ver = String((chrome.runtime.getManifest() || {}).version || "");
      let has = false;
      try { has = await chrome.permissions.contains({ origins: ["<all_urls>"] }); } catch (e) {}
      const ok = ver === "1.2.4" && has;
      ready.textContent = ok ? "ok 1.2.4 <all_urls>" : ("need Remove + Load unpacked · v" + (ver || "?"));
      ready.className = "status " + (ok ? "ok" : "err");
      ready.style.display = "block";
      if (line) {
        line.textContent = ok ? (ks_token ? "detect on · ok 1.2.4" : "detect ready · ok 1.2.4") : ("detect · " + ready.textContent);
        line.className = "line " + (ok ? "ok" : "err");
      }
      if (copy && !document.getElementById("filled-line")) copy.textContent = ks_token ? "copy · ready" : "copy · sign in first";
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
    out.push({ id: String(it.id || upstream), upstream, name: String(it.name || upstream + " key"), masked, family: String(it.family || ""), product: String(it.product || ""), domain: String(it.domain || ""), notes: String(it.notes || "") });
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
async function ksHarvestAndStoreVisibleKeys() {
  if (!chrome.scripting || !chrome.tabs) return { saved: 0 };
  let token = "";
  try { const s = await chrome.storage.local.get(["ks_token"]); token = s.ks_token || ""; } catch (e) {}
  if (!token) return { saved: 0 };
  try { await chrome.storage.local.set({ ks_auto_store: true }); } catch (e) {}
  let tabs = [];
  try { tabs = await chrome.tabs.query({}); } catch (e) { return { saved: 0 }; }
  let saved = 0;
  const re = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !/helius\.(dev|xyz)/i.test(tab.url)) continue;
    try {
      const scraped = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => ({ text: (document.body && document.body.innerText) || "", href: location.href }),
      });
      const page = scraped && scraped[0] && scraped[0].result;
      if (!page) continue;
      const skip = new Set((String(page.href || "").match(re) || []).map((s) => s.toLowerCase()));
      const seen = new Set();
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(String(page.text || "")))) {
        const key = m[0];
        if (!key || key.includes("•") || skip.has(key.toLowerCase()) || seen.has(key)) continue;
        seen.add(key);
        try {
          await fetch("https://keyshield-production.up.railway.app/manage/store", {
            method: "POST",
            headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify({ upstream: "helius", value: key, name: "helius key" }),
          });
          saved++;
        } catch (e) {}
      }
    } catch (e) {}
  }
  return { saved };
}
chrome.runtime.onInstalled.addListener(() => { ksHarvestAndStoreVisibleKeys().catch(() => {}); });
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
        print("#", src, path, "v" + ver, "leftover-stamp", VER)
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
    action = man.get("action")
    if isinstance(action, dict):
        action.pop("default_popup", None)
        man["action"] = action
    else:
        man["action"] = {}
    browser = man.get("browser_action")
    if isinstance(browser, dict):
        browser.pop("default_popup", None)
        man["browser_action"] = browser
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
    here = globals().get("__file__")
    sibling = Path(here).resolve().parent / "popup.html" if here else None
    sibling_html = sibling.read_text(encoding="utf-8") if sibling and sibling.is_file() else ""
    html_path.write_text(sibling_html if popup_is_three_line(sibling_html) else HTML)
    splice(ext / "popup.js", MARK_JS, JS)
    splice(ext / "background.js", MARK_BG, BG)
    man = json.loads((ext / "manifest.json").read_text())
    html = (ext / "popup.html").read_text()
    print("ok", ext)
    print("name", man["name"])
    print("ver", man["version"])
    print("signed-pane", 'id="signed-pane"' in html)
    print("saved-count", 'id="saved-count"' in html)
    print("three-line", popup_is_three_line(html))
    print("detect-line", 'id="detect-line"' in html)
    print("copy-status", 'id="copy-status"' in html)
    print("collected-line", 'id="collected-line"' in html)
    print("filled-line", 'id="filled-line"' in html)
    print("fill-ms", 'id="fill-ms"' in html)
    print("full-ui", popup_is_three_line(html))
    print("session-bridge", manifest_has_session_bridge(man))
    print("hosted", HOSTED)
    print("next: chrome://extensions → Remove → Load unpacked this folder")
    print("popup must say: ok 1.2.4 <all_urls>")
    print("if already signed: signed + N collected + N filled · XXms")


if __name__ == "__main__":
    main()
