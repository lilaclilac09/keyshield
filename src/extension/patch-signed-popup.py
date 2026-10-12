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
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>KeyShield</title>
  <style>
    :root {
      color-scheme: dark;
    }
    body {
      width: 320px;
      margin: 0;
      padding: 16px;
      background: #0a0d1a;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif;
      font-size: 13px;
      line-height: 1.5;
    }
    h1 {
      margin: 0 0 4px 0;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .sub {
      color: #71717a;
      font-size: 11px;
      margin-bottom: 14px;
    }
    label {
      display: block;
      font-size: 11px;
      color: #a1a1aa;
      margin-bottom: 4px;
      margin-top: 10px;
    }
    input[type="text"] {
      box-sizing: border-box;
      width: 100%;
      padding: 7px 9px;
      background: #020408;
      border: 1px solid #1c2238;
      border-radius: 6px;
      color: #e4e4e7;
      font-family: "JetBrains Mono", monospace;
      font-size: 11px;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: #5b8cff;
    }
    button {
      cursor: pointer;
      width: 100%;
      margin-top: 12px;
      padding: 8px 12px;
      background: #5b8cff;
      color: white;
      border: 1px solid #5b8cff;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
    }
    button:hover {
      background: #7aa1ff;
    }
    .status {
      margin-top: 10px;
      padding: 6px 8px;
      border-radius: 6px;
      font-size: 11px;
      display: none;
    }
    .status.ok {
      display: block;
      background: rgba(16, 185, 129, 0.12);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .status.err {
      display: block;
      background: rgba(239, 68, 68, 0.12);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      background: rgba(91, 140, 255, 0.15);
      color: #93b4ff;
      border: 1px solid rgba(91, 140, 255, 0.3);
      margin-left: 4px;
    }
    .footer {
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid #1c2238;
      font-size: 10px;
      color: #71717a;
    }
    button.secondary {
      background: transparent;
      color: #a1a1aa;
      border-color: #27272a;
    }
    button.secondary:hover {
      color: #fafafa;
      border-color: #3f3f46;
      background: transparent;
    }
    button.danger {
      background: transparent;
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.3);
    }
    button.danger:hover {
      color: #fecaca;
      border-color: #f87171;
      background: rgba(239, 68, 68, 0.08);
    }
    .row {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }
    .row button { margin-top: 0; flex: 1; }
    details {
      margin-top: 12px;
      border-top: 1px solid #1c2238;
      padding-top: 10px;
    }
    details summary {
      cursor: pointer;
      font-size: 11px;
      color: #71717a;
      user-select: none;
      outline: none;
    }
    details summary:hover { color: #a1a1aa; }
    textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 56px;
      padding: 7px 9px;
      background: #020408;
      border: 1px solid #1c2238;
      border-radius: 6px;
      color: #e4e4e7;
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      resize: vertical;
      margin-top: 4px;
    }
    textarea:focus { outline: none; border-color: #5b8cff; }
    .fingerprint {
      font-family: "JetBrains Mono", monospace;
      font-size: 16px;
      color: #5b8cff;
      padding: 8px 10px;
      border: 1px dotted #5b8cff;
      border-radius: 6px;
      margin-top: 4px;
      letter-spacing: 0.06em;
      text-align: center;
      background: rgba(91, 140, 255, 0.05);
    }
    .info-block {
      font-size: 10px;
      color: #a1a1aa;
      margin: 6px 0 8px 0;
      line-height: 1.5;
    }
    .info-block.subtle {
      color: #71717a;
    }
    .info-block code {
      font-family: "JetBrains Mono", monospace;
      font-size: 10px;
      color: #93b4ff;
    }
    .hint {
      color: #52525b;
      font-family: "JetBrains Mono", monospace;
      font-weight: normal;
    }
    input[type="file"] {
      box-sizing: border-box;
      width: 100%;
      padding: 6px 0;
      color: #a1a1aa;
      font-size: 11px;
    }
    input[type="file"]::file-selector-button {
      background: transparent;
      color: #a1a1aa;
      border: 1px solid #27272a;
      border-radius: 6px;
      padding: 5px 9px;
      margin-right: 8px;
      font-size: 11px;
      cursor: pointer;
    }
    input[type="file"]::file-selector-button:hover {
      color: #fafafa;
      border-color: #3f3f46;
    }
    .api-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      padding: 8px 10px;
      margin-top: 6px;
      background: #020408;
      border: 1px solid #1c2238;
      border-radius: 6px;
    }
    .api-row strong { font-size: 12px; color: #e4e4e7; }
    .api-row code { font-size: 10px; color: #93b4ff; word-break: break-all; }
    .saved-count {
      margin: 8px 0 2px;
      font-size: 28px;
      font-weight: 700;
      letter-spacing: -0.03em;
      color: #fafafa;
      line-height: 1.1;
    }
    body.signed-in .guest-only { display: none !important; }
    body:not(.signed-in) .signed-only { display: none !important; }
  </style>
</head>
<body>
  <h1>KeyShield — Sovereign Vault <span class="badge" id="conn">…</span></h1>
  <div class="sub guest-only">Auto-detect API keys and store them in your encrypted vault.</div>
  <div id="detect-ready" class="status" style="display:block;margin-top:8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all">
    checking 1.2.4 + &lt;all_urls&gt;…
  </div>
  <div id="build" class="sub" style="margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all">
    checking loaded build…
  </div>

  <div id="signed-pane" class="signed-only">
    <p id="saved-count" class="saved-count">0 saved</p>
    <p class="sub" style="margin:4px 0 8px">Already signed in. Detect stays on — new keys add to this list.</p>
    <div id="saved-apis"></div>
    <p id="saved-empty" class="info-block">None yet. Leave cursor.com / openai / openrouter open and click Show.</p>
    <button id="fill-tab-signed" class="secondary">Fill this tab</button>
    <button id="copy-cursor-key-signed" class="secondary">Copy key for Cursor API box</button>
    <button id="clear-top" class="danger">Sign out</button>
  </div>

  <button id="signin" class="guest-only">→ Sign in to KeyShield</button>
  <button id="allow-detect" class="secondary guest-only">Allow detect + auto-save</button>
  <button id="fill-tab" class="secondary guest-only">Fill this tab</button>
  <button id="copy-cursor-key" class="secondary guest-only">Copy key for Cursor API box</button>
  <button id="use-hosted-top" class="secondary guest-only">Use hosted app.ks.aileena.xyz</button>
  <p class="hint guest-only" style="margin:8px 0 0;line-height:1.45">
    Popup must show <code>ok 1.2.4 &lt;all_urls&gt;</code>. If it does not:
    chrome://extensions → <strong>Remove</strong> then <strong>Load unpacked</strong>
    <code>src/extension</code>. Do not only Reload. After Sign-in the scanner
    stays on and saves <code>sk-proj-</code> / <code>sk-or-</code> / <code>key_</code>
    / <code>crsr_</code> / <code>helius_auth_</code>. Saved keys auto-fill the
    matching API blank (Cursor Settings black box included). Chrome cannot
    inject into Cursor desktop — use <strong>Copy key for Cursor API box</strong>
    then paste. Cursor: click Show first.
  </p>
  <div id="status" class="status"></div>

  <label for="manual" class="guest-only">Paste session token (works on 1.1.1)</label>
  <textarea id="manual" class="guest-only" placeholder="paste session token from app.ks.aileena.xyz Home or Developer"></textarea>
  <div class="row guest-only">
    <button id="register" class="secondary">Register token</button>
    <button id="clear" class="danger">Sign out</button>
  </div>

  <details class="guest-only">
    <summary>Settings</summary>

    <label for="api">Backend API base URL</label>
    <input type="text" id="api" placeholder="https://keyshield-production.up.railway.app" />

    <label for="dash">Dashboard URL</label>
    <input type="text" id="dash" placeholder="https://app.ks.aileena.xyz" />

    <div class="row">
      <button id="save" class="secondary">Save settings</button>
    </div>
  </details>

  <details class="guest-only">
    <summary>Cross-device sync</summary>

    <div class="info-block">
      Your vault key is derived from your wallet signature, so the SAME wallet
      produces the SAME key on every browser. Sign in to KeyShield in another
      browser (same wallet) and compare these 8 hex chars — if they match,
      both browsers can decrypt the same vault.
    </div>

    <label>Vault key fingerprint <span class="hint">SHA-256(key)[:4]</span></label>
    <div id="fingerprint" class="fingerprint">—</div>

    <label for="remote">Remote API base (for deployed backend)</label>
    <input type="text" id="remote" placeholder="https://keyshield-production.up.railway.app" />
    <div class="row">
      <button id="point-remote" class="secondary">Point at remote</button>
      <button id="point-local"  class="secondary">Use local dev</button>
      <button id="point-prod"   class="secondary">Use production</button>
    </div>

    <div class="info-block subtle">
      Default: <code>https://keyshield-production.up.railway.app</code> — public
      backend, ciphertext synced via the Cloudflare worker.
      Local: <code>http://127.0.0.1:8001</code> — ciphertext lives in your
      machine's SQLite (only useful while you're running the dev stack).
      Same wallet sig + same backend URL ⇒ same vault visible from anywhere.
    </div>
  </details>

  <details class="guest-only">
    <summary>Backup &amp; restore</summary>

    <div class="info-block">
      Export your encrypted vault to a JSON file. Decryption still requires
      your wallet, so the file is safe to put on a USB drive, iCloud Drive,
      or even a public Gist — without the wallet sig it's opaque ciphertext.
    </div>

    <div class="row">
      <button id="export-vault" class="secondary">Export to file…</button>
    </div>

    <label for="import-file">Restore from JSON file</label>
    <input type="file" id="import-file" accept="application/json" />
    <div class="row">
      <button id="import-vault" class="secondary">Restore</button>
    </div>

    <div id="backup-status" class="status"></div>
  </details>

  <div class="footer guest-only">
    Sign-in opens the hosted dashboard already logged in when a session
    exists. First visit still needs wallet or passkey once.
  </div>

  <script src="popup.js"></script>
</body>
</html>
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
        'id="signed-pane"' not in html_now
        or "ok 1.2.4" not in html_now
        or "<details" not in html_now
        or 'id="fingerprint"' not in html_now
        or 'id="saved-count"' not in html_now
    )
    if compact:
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
    print("full-ui", "<details" in html and 'id="fingerprint"' in html)
    print("hosted", HOSTED)
    print("next: chrome://extensions → Remove → Load unpacked this folder")
    print("popup must say: ok 1.2.4 <all_urls>")
    print("if already signed: N saved + list + Sign out")


if __name__ == "__main__":
    main()
