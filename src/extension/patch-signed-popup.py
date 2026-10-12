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
<html lang="en"><head><meta charset="UTF-8"/>
<title>KeyShield</title>
<style>
:root{color-scheme:dark}
body{width:320px;margin:0;padding:16px;background:#0a0d1a;color:#e4e4e7;font:13px/1.5 -apple-system,system-ui,sans-serif}
h1{margin:0 0 4px;font-size:15px}
.sub,.info-block,.hint,.footer{color:#71717a;font-size:11px}
.badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;color:#93b4ff;border:1px solid rgba(91,140,255,.3);margin-left:4px}
button{cursor:pointer;width:100%;margin-top:12px;padding:8px 12px;background:#5b8cff;color:#fff;border:1px solid #5b8cff;border-radius:6px;font-size:12px}
button.secondary{background:transparent;color:#a1a1aa;border-color:#27272a}
button.danger{background:transparent;color:#f87171;border-color:rgba(239,68,68,.3)}
.status{margin-top:10px;padding:6px 8px;border-radius:6px;font-size:11px;display:none}
.status.ok{display:block;background:rgba(16,185,129,.12);color:#34d399;border:1px solid rgba(16,185,129,.3)}
.status.err{display:block;background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.3)}
label{display:block;font-size:11px;color:#a1a1aa;margin:10px 0 4px}
input[type=text],textarea{box-sizing:border-box;width:100%;padding:7px 9px;background:#020408;border:1px solid #1c2238;border-radius:6px;color:#e4e4e7;font-family:ui-monospace,monospace;font-size:11px}
.row{display:flex;gap:6px;margin-top:8px}.row button{margin-top:0;flex:1}
details{margin-top:12px;border-top:1px solid #1c2238;padding-top:10px}
.api-row{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;margin-top:6px;background:#020408;border:1px solid #1c2238;border-radius:6px}
.api-row strong{font-size:12px}.api-row code{font-size:10px;color:#93b4ff;word-break:break-all}
body.signed-in .guest-only{display:none !important}
body:not(.signed-in) .signed-only{display:none !important}
</style></head><body>
<h1>KeyShield — Sovereign Vault <span class="badge" id="conn">…</span></h1>
<div class="sub guest-only">Auto-detect API keys and store them in your encrypted vault.</div>
<div class="sub signed-only">Already signed in — saved APIs only. Detect stays on.</div>
<div id="detect-ready" class="status" style="display:block">ok 1.2.4 + &lt;all_urls&gt;…</div>
<div id="build" class="sub">checking loaded build…</div>
<div id="signed-pane" class="signed-only">
  <p class="sub">Saved APIs</p>
  <div id="saved-apis"></div>
  <p id="saved-empty" class="info-block">None yet. Leave a provider tab open — detect saves here.</p>
  <button id="clear-top" class="danger">Sign out</button>
</div>
<button id="signin" class="guest-only">→ Sign in to KeyShield</button>
<button id="allow-detect" class="secondary guest-only">Allow detect + auto-save</button>
<button id="fill-tab" class="secondary guest-only">Fill this tab</button>
<button id="copy-cursor-key" class="secondary guest-only">Copy key for Cursor API box</button>
<button id="use-hosted-top" class="secondary guest-only">Use hosted app.ks.aileena.xyz</button>
<div id="status" class="status"></div>
<label for="manual" class="guest-only">Paste session token</label>
<textarea id="manual" class="guest-only" placeholder="paste session token"></textarea>
<div class="row guest-only">
  <button id="register" class="secondary">Register token</button>
  <button id="clear" class="danger">Sign out</button>
</div>
<details class="guest-only"><summary>Settings</summary>
<label for="api">Backend API base URL</label>
<input type="text" id="api" placeholder="https://keyshield-production.up.railway.app"/>
<label for="dash">Dashboard URL</label>
<input type="text" id="dash" placeholder="https://app.ks.aileena.xyz"/>
<button id="save" class="secondary">Save settings</button>
</details>
<details class="guest-only"><summary>Sync</summary>
<div id="fingerprint" class="sub">—</div>
<input type="text" id="remote"/>
<div class="row">
  <button id="point-remote" class="secondary">Point at remote</button>
  <button id="point-local" class="secondary">Use local dev</button>
  <button id="point-prod" class="secondary">Use production</button>
</div>
</details>
<details class="guest-only"><summary>Backup</summary>
<button id="export-vault" class="secondary">Export</button>
<input type="file" id="import-file" accept="application/json"/>
<button id="import-vault" class="secondary">Restore</button>
<div id="backup-status" class="status"></div>
</details>
<div class="footer guest-only">Sign-in opens hosted app.ks.aileena.xyz</div>
<script src="popup.js"></script>
</body></html>
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
async function refreshSavedApis() {
  const box = document.getElementById("saved-apis");
  const empty = document.getElementById("saved-empty");
  if (!box) return [];
  let resp = { apis: [] };
  try { resp = await chrome.runtime.sendMessage({ type: "LIST_SAVED_APIS" }); } catch (e) {}
  const apis = resp && Array.isArray(resp.apis) ? resp.apis : [];
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
  if (empty) empty.style.display = apis.length ? "none" : "block";
  return apis;
}
async function ksBootSignedPane() {
  try {
    const { ks_token } = await chrome.storage.local.get("ks_token");
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
    if 'id="signed-pane"' not in html_now or "ok 1.2.4" not in html_now:
        html_path.write_text(HTML)
    splice(ext / "popup.js", MARK_JS, JS)
    splice(ext / "background.js", MARK_BG, BG)
    man = json.loads((ext / "manifest.json").read_text())
    html = (ext / "popup.html").read_text()
    print("ok", ext)
    print("name", man["name"])
    print("ver", man["version"])
    print("signed-pane", 'id="signed-pane"' in html)
    print("hosted", HOSTED)
    print("next: chrome://extensions → Remove → Load unpacked this folder")
    print("popup must say: ok 1.2.4 <all_urls>")
    print("if already signed: only Saved APIs + Sign out")


if __name__ == "__main__":
    main()
