/**
 * Home / Docs Trouble case: leftover Load unpacked 1.2.1 + github.com DNS fail.
 * Find the clone from Chrome internals (Preferences path) and a home walk —
 * do not hardcode ~/Downloads/privacy_hack/keyshield.
 */

export const LEFTOVER_121_CASE_ID = 'leftover-121';

export const CHROME_INTERNALS_PREF_ROOTS = [
  '~/Library/Application Support/Google/Chrome',
  '~/Library/Application Support/Google/Chrome Beta',
  '~/Library/Application Support/Google/Chrome Canary',
  '~/Library/Application Support/Chromium',
  '~/Library/Application Support/Microsoft Edge',
  '~/Library/Application Support/BraveSoftware/Brave-Browser',
  '~/Library/Application Support/Arc/User Data',
  '~/.config/google-chrome',
  '~/.config/chromium',
  '~/.config/microsoft-edge',
  '~/.config/BraveSoftware/Brave-Browser',
  '~/snap/chromium/common/chromium',
] as const;

export const FIND_WALK_ROOTS = [
  '~/Downloads',
  '~/Documents',
  '~/Desktop',
  '~/src',
  '~/code',
  '~/dev',
  '~/work',
  '~/privacy_hack',
] as const;

export const PATCH_BRANCH = 'cursor/cursor-api-autofill-b48a';
export const PATCH_VERSION = '1.2.4';

export const LEFTOVER_121_CASE = {
  id: LEFTOVER_121_CASE_ID,
  title: 'Leftover 1.2.4 · missing session-bridge',
  titleZh: '本地 1.2.4 只有 content.js · Sign-in 进不了扩展',
  symptom:
    'Card can already say KeyShield — Sovereign Vault 1.2.4 and ok 1.2.4 <all_urls>, but chrome://extensions → Details → loaded manifest.json only lists content.js on <all_urls>. Hosted Sign-in never writes chrome.storage — popup stays no token. git pull cannot resolve github.com.',
  symptomZh:
    '卡片已经是 1.2.4、popup 也能绿 ok 1.2.4 <all_urls>，但加载的 manifest 只有 content.js，没有 session-bridge.js。hosted Sign-in 写不进扩展，popup 一直 no token。github.com 解析失败。',
} as const;

export function shouldSkipGitPull(stderr: string): boolean {
  return /could not resolve|nodename nor servname|name or service not known|temporary failure in name resolution|github\.com/i.test(
    String(stderr || ''),
  );
}

export function repoRootFromExt(extPath: string): string {
  const n = String(extPath || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (n.endsWith('/src/extension')) return n.slice(0, -'/src/extension'.length);
  if (n.endsWith('/extension')) return n.slice(0, -'/extension'.length);
  return n;
}

export function isKeyshieldExtManifest(man: { name?: string }): boolean {
  const name = String(man?.name || '');
  return name.includes('KeyShield') || name.includes('Sovereign Vault');
}

/** Standalone python3: print Chrome-internals + home-walk hits, then export KS_ROOT / KS_EXT. */
export const FIND_LOCAL_PATH_PY = `from pathlib import Path
import json, shlex, sys

SKIP = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", "Library", "AppData"}

def looks_ext(p):
    return (p / "manifest.json").is_file() and (p / "popup.js").is_file()

def keyshield_name(p):
    try:
        n = str(json.loads((p / "manifest.json").read_text(encoding="utf-8")).get("name") or "")
    except Exception:
        return False
    return "KeyShield" in n or "Sovereign Vault" in n

def repo_root(ext):
    if ext.name == "extension" and ext.parent.name == "src":
        return ext.parent.parent
    if ext.name == "extension":
        return ext.parent
    return ext

def walk(root, max_depth=5):
    if not root.is_dir():
        return
    stack = [(root, 0)]
    while stack:
        p, d = stack.pop()
        if d > max_depth:
            continue
        try:
            kids = list(p.iterdir())
        except OSError:
            continue
        names = {c.name for c in kids}
        if "manifest.json" in names and "popup.js" in names:
            yield p
            continue
        if d == max_depth:
            continue
        for c in kids:
            if c.is_dir() and c.name not in SKIP and not c.name.startswith("."):
                stack.append((c, d + 1))

hits = []
here = Path.cwd().resolve()
for p in [here, *here.parents]:
    for cand in (p / "src/extension", p, p / "extension"):
        if looks_ext(cand) and keyshield_name(cand):
            hits.append(("cwd", cand))

home = Path.home()
bases = [
    home / "Library/Application Support/Google/Chrome",
    home / "Library/Application Support/Google/Chrome Beta",
    home / "Library/Application Support/Google/Chrome Canary",
    home / "Library/Application Support/Chromium",
    home / "Library/Application Support/Microsoft Edge",
    home / "Library/Application Support/BraveSoftware/Brave-Browser",
    home / "Library/Application Support/Arc/User Data",
    home / ".config/google-chrome",
    home / ".config/chromium",
    home / ".config/microsoft-edge",
    home / ".config/BraveSoftware/Brave-Browser",
    home / "snap/chromium/common/chromium",
]
for b in bases:
    if not b.is_dir():
        continue
    for pref in b.glob("*/Preferences"):
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
            path = row.get("path")
            if not path or not isinstance(path, str):
                continue
            cand = Path(path).expanduser()
            if not cand.is_absolute() or not looks_ext(cand):
                continue
            man = row.get("manifest") if isinstance(row.get("manifest"), dict) else {}
            name = str(man.get("name") or "")
            if name and ("KeyShield" not in name and "Sovereign Vault" not in name):
                if not keyshield_name(cand):
                    continue
            elif not name and not keyshield_name(cand):
                continue
            hits.append(("chrome-internals", cand))

for root in (
    home / "Downloads",
    home / "Documents",
    home / "Desktop",
    home / "src",
    home / "code",
    home / "dev",
    home / "work",
    home / "privacy_hack",
):
    for cand in walk(root):
        if keyshield_name(cand):
            hits.append(("walk", cand))

seen = set()
ordered = []
for src, p in hits:
    try:
        r = p.resolve()
    except OSError:
        continue
    if r in seen or not looks_ext(r):
        continue
    seen.add(r)
    ordered.append((src, r))

rank = {"cwd": 0, "chrome-internals": 1, "walk": 2}
ordered.sort(key=lambda it: rank.get(it[0], 9))
if not ordered:
    sys.stderr.write("no KeyShield folder (Chrome internals + home walk + cwd)\\n")
    sys.exit(1)
for src, p in ordered:
    ver = ""
    try:
        ver = str(json.loads((p / "manifest.json").read_text(encoding="utf-8")).get("version") or "")
    except Exception:
        pass
    print("#", src, p, "v" + ver)
ext = ordered[0][1]
root = repo_root(ext)
print("export KS_ROOT=" + shlex.quote(str(root)))
print("export KS_EXT=" + shlex.quote(str(ext)))
`;

export const OFFLINE_PATCH_PY = `from pathlib import Path
import json
NAME = "KeyShield — Sovereign Vault"
VER = "1.2.4"
HOSTED = "https://app.ks.aileena.xyz"
MARK_JS = "/* KS-SIGNED-1.2.4 */"
MARK_BG = "/* KS-LIST-SAVED-1.2.4 */"

def looks_ext(p):
    return (p / "manifest.json").is_file() and (p / "popup.js").is_file()

def keyshield_name(p):
    try:
        n = str(json.loads((p / "manifest.json").read_text(encoding="utf-8")).get("name") or "")
    except Exception:
        return False
    return "KeyShield" in n or "Sovereign Vault" in n

def walk(root, max_depth=5):
    skip = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", "Library", "AppData"}
    if not root.is_dir():
        return
    stack = [(root, 0)]
    while stack:
        p, d = stack.pop()
        if d > max_depth:
            continue
        try:
            kids = list(p.iterdir())
        except OSError:
            continue
        names = {c.name for c in kids}
        if "manifest.json" in names and "popup.js" in names:
            yield p
            continue
        if d == max_depth:
            continue
        for c in kids:
            if c.is_dir() and c.name not in skip and not c.name.startswith("."):
                stack.append((c, d + 1))

hits = []
here = Path.cwd().resolve()
for p in [here, *here.parents]:
    for cand in (p / "src/extension", p, p / "extension"):
        if looks_ext(cand):
            hits.append(cand)
home = Path.home()
for b in (
    home / "Library/Application Support/Google/Chrome",
    home / "Library/Application Support/Microsoft Edge",
    home / "Library/Application Support/BraveSoftware/Brave-Browser",
    home / "Library/Application Support/Arc/User Data",
    home / ".config/google-chrome",
    home / ".config/chromium",
):
    if not b.is_dir():
        continue
    for pref in b.glob("*/Preferences"):
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
            path = row.get("path")
            if path and isinstance(path, str):
                cand = Path(path).expanduser()
                if cand.is_absolute() and looks_ext(cand) and keyshield_name(cand):
                    hits.append(cand)
for root in (home / "Downloads", home / "Documents", home / "Desktop", home / "src", home / "dev", home / "work", home / "privacy_hack"):
    hits.extend(walk(root))
seen = set()
ordered = []
for p in hits:
    try:
        r = p.resolve()
    except OSError:
        continue
    if r in seen or not looks_ext(r):
        continue
    seen.add(r)
    ordered.append(r)
if not ordered:
    raise SystemExit("no KeyShield folder — chrome://extensions Details → Loaded from, then cd that folder")
ext = ordered[0]
man = json.loads((ext / "manifest.json").read_text())
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
man["content_scripts"] = [
    {"matches": ["https://app.ks.aileena.xyz/*", "https://*.aileena.xyz/*", "https://keyshield.dev/*", "https://*.keyshield.dev/*", "https://*.up.railway.app/*", "https://*.vercel.app/*", "http://127.0.0.1:5173/*", "http://localhost:5173/*", "http://127.0.0.1:3000/*", "http://localhost:3000/*"], "js": ["session-bridge.js"], "run_at": "document_start"},
    {"matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle", "all_frames": True},
]
bridge = ext / "session-bridge.js"
if (not bridge.is_file()) or ("capturePageToken" not in bridge.read_text(encoding="utf-8")):
    bridge.write_text(r'''
(function keyShieldSessionBridge(){
  function announce(){if(typeof chrome==="undefined"||!chrome.runtime||!chrome.runtime.id)return;try{window.postMessage({__ks_ext_announce:chrome.runtime.id},location.origin)}catch(e){}}
  function readPageSession(){try{return{token:localStorage.getItem("ks_token")||"",user:localStorage.getItem("ks_wallet")||localStorage.getItem("ks_passkey_user")||""}}catch(e){return{token:"",user:""}}}
  function capturePageToken(){if(typeof chrome==="undefined"||!chrome.storage||!chrome.storage.local)return;var page=readPageSession();if(!page.token||page.token.trim().length<12)return;chrome.storage.local.get(["ks_token"],function(stored){if(stored&&stored.ks_token===page.token)return;chrome.storage.local.set({ks_token:page.token,ks_user:page.user||null,ks_auto_store:true})})}
  function shareSession(){if(typeof chrome==="undefined"||!chrome.storage||!chrome.storage.local)return;capturePageToken();chrome.storage.local.get(["ks_token","ks_user"],function(stored){var token=stored&&stored.ks_token;if(!token)return;try{if(!localStorage.getItem("ks_token"))localStorage.setItem("ks_token",token)}catch(e){}try{window.postMessage({__ks_ext_session:{token:token,user:stored.ks_user||null}},location.origin)}catch(e){}})}
  announce();shareSession();capturePageToken();
  [400,1200,3000,8000].forEach(function(ms){setTimeout(capturePageToken,ms)});
  window.addEventListener("ks-auth-changed",capturePageToken);
  window.addEventListener("storage",capturePageToken);
  window.addEventListener("message",function(e){if(e.source!==window||!e.data)return;if(e.data.__ks_ext_request)announce();if(e.data.__ks_ext_request_session)shareSession();if(e.data.__ks_page_session||e.data.__ks_auth_changed)capturePageToken()});
})();
'''.lstrip())
(ext / "manifest.json").write_text(json.dumps(man, indent=2) + "\\n")
html_now = (ext / "popup.html").read_text() if (ext / "popup.html").exists() else ""
if 'id="signed-pane"' not in html_now or "ok 1.2.4" not in html_now or "<details" not in html_now or 'id="saved-count"' not in html_now:
    (ext / "popup.html").write_text("""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>KeyShield</title>
<style>:root{color-scheme:dark}body{width:320px;margin:0;padding:16px;background:#0a0d1a;color:#e4e4e7;font:13px/1.5 -apple-system,system-ui,sans-serif}h1{margin:0 0 4px;font-size:15px}.sub,.info-block,.footer{color:#71717a;font-size:11px}button{cursor:pointer;width:100%;margin-top:12px;padding:8px 12px;background:#5b8cff;color:#fff;border:1px solid #5b8cff;border-radius:6px}button.secondary{background:transparent;color:#a1a1aa;border-color:#27272a}button.danger{background:transparent;color:#f87171;border-color:rgba(239,68,68,.3)}.status{margin-top:10px;padding:6px 8px;border-radius:6px;font-size:11px;display:none}.status.ok{display:block;background:rgba(16,185,129,.12);color:#34d399}.status.err{display:block;background:rgba(239,68,68,.12);color:#f87171}.api-row{display:flex;justify-content:space-between;gap:8px;padding:8px 10px;margin-top:6px;background:#020408;border:1px solid #1c2238;border-radius:6px}body.signed-in .guest-only{display:none !important}body:not(.signed-in) .signed-only{display:none !important}</style></head><body>
<h1>KeyShield — Sovereign Vault <span id="conn"></span></h1>
<div class="sub signed-only">Already signed in — saved APIs only. Detect stays on.</div>
<div id="detect-ready" class="status" style="display:block">ok 1.2.4 + &lt;all_urls&gt;…</div>
<div id="build" class="sub"></div>
<div id="signed-pane" class="signed-only"><p id="saved-count" class="saved-count">0 saved</p><p class="sub">Already signed in. Detect stays on.</p><div id="saved-apis"></div><p id="saved-empty">None yet. Leave a provider tab open — detect saves here.</p><button id="clear-top" class="danger">Sign out</button></div>
<button id="signin" class="guest-only">Sign in to KeyShield</button>
<button id="allow-detect" class="secondary guest-only">Allow detect + auto-save</button>
<button id="fill-tab" class="secondary guest-only">Fill this tab</button>
<button id="copy-cursor-key" class="secondary guest-only">Copy key for Cursor API box</button>
<button id="use-hosted-top" class="secondary guest-only">Use hosted</button>
<div id="status" class="status"></div>
<textarea id="manual" class="guest-only"></textarea>
<div class="guest-only"><button id="register" class="secondary">Register token</button><button id="clear" class="danger">Sign out</button></div>
<details class="guest-only"><summary>Settings</summary><input id="api"/><input id="dash"/><button id="save">Save</button></details>
<div id="fingerprint"></div><input id="remote"/>
<button id="point-remote"></button><button id="point-local"></button><button id="point-prod"></button>
<button id="export-vault"></button><input id="import-file" type="file"/><button id="import-vault"></button>
<div id="backup-status"></div>
<script src="popup.js"></script></body></html>
""")
js = r'''
/* KS-SIGNED-1.2.4 */
function summarizeSavedApis(data){const rows=Array.isArray(data)?data:data&&Array.isArray(data.items)?data.items:data&&Array.isArray(data.keys)?data.keys:[];const out=[];for(const it of rows){if(!it||typeof it!=="object")continue;const upstream=String(it.upstream||"").toLowerCase().trim();if(!upstream)continue;let masked=String(it.masked_value||"").trim();if(!masked)masked=it.cipher?"encrypted":"saved";out.push({id:String(it.id||upstream),upstream,name:String(it.name||upstream+" key"),masked});}return out;}
function applySignedInChrome(signed){try{document.body.classList.toggle("signed-in",!!signed);}catch(e){}}
async function refreshSavedApis(){const box=document.getElementById("saved-apis");const empty=document.getElementById("saved-empty");if(!box)return[];let resp={apis:[]};try{resp=await chrome.runtime.sendMessage({type:"LIST_SAVED_APIS"});}catch(e){}const apis=resp&&Array.isArray(resp.apis)?resp.apis:[];box.replaceChildren();for(const api of apis){const row=document.createElement("div");row.className="api-row";const name=document.createElement("strong");name.textContent=api.upstream;const mask=document.createElement("code");mask.textContent=api.masked;row.append(name,mask);box.appendChild(row);}if(empty)empty.style.display=apis.length?"none":"block";return apis;}
async function ksBootSignedPane(){try{const {ks_token}=await chrome.storage.local.get("ks_token");applySignedInChrome(!!ks_token);if(ks_token){try{await chrome.storage.local.set({ks_auto_store:true});}catch(e){}try{await chrome.runtime.sendMessage({type:"INJECT_DETECT"});}catch(e){}await refreshSavedApis();}const ready=document.getElementById("detect-ready");if(ready){const ver=String((chrome.runtime.getManifest()||{}).version||"");let has=false;try{has=await chrome.permissions.contains({origins:["<all_urls>"]});}catch(e){}const ok=ver==="1.2.4"&&has;ready.textContent=ok?"ok 1.2.4 <all_urls>":("need Remove + Load unpacked · v"+(ver||"?"));ready.className="status "+(ok?"ok":"err");ready.style.display="block";}}catch(e){}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ksBootSignedPane);else ksBootSignedPane();
'''
bg = r'''
/* KS-LIST-SAVED-1.2.4 */
function summarizeSavedApis(data){const rows=Array.isArray(data)?data:data&&Array.isArray(data.items)?data.items:data&&Array.isArray(data.keys)?data.keys:[];const out=[];for(const it of rows){if(!it||typeof it!=="object")continue;const upstream=String(it.upstream||"").toLowerCase().trim();if(!upstream)continue;let masked=String(it.masked_value||"").trim();if(!masked)masked=it.cipher?"encrypted":"saved";out.push({id:String(it.id||upstream),upstream,masked});}return out;}
async function listSavedApis(){let token="",apiBase="https://keyshield-production.up.railway.app";try{const s=await chrome.storage.local.get(["ks_token","ks_api_base"]);token=s.ks_token||"";if(s.ks_api_base)apiBase=String(s.ks_api_base).replace(/\\/+$/,"");}catch(e){}if(!token)return{ok:false,apis:[]};try{const r=await fetch(apiBase+"/manage/vault",{headers:{Authorization:"Bearer "+token}});if(!r.ok)return{ok:false,apis:[]};return{ok:true,apis:summarizeSavedApis(await r.json())};}catch(e){return{ok:false,apis:[]};}}
chrome.runtime.onMessage.addListener((message,_s,sendResponse)=>{if(!message||message.type!=="LIST_SAVED_APIS")return;listSavedApis().then(sendResponse).catch(()=>sendResponse({ok:false,apis:[]}));return true;});
'''
def splice(path, mark, block):
    t = path.read_text()
    if mark in t:
        t = t.split(mark)[0].rstrip() + "\\n"
    path.write_text(t.rstrip() + "\\n" + block.lstrip() + "\\n")
splice(ext / "popup.js", MARK_JS, js)
splice(ext / "background.js", MARK_BG, bg)
html = (ext / "popup.html").read_text()
man2 = json.loads((ext / "manifest.json").read_text())
print("ok", ext)
print("ver", man2["version"])
print("signed-pane", 'id="signed-pane"' in html)
print("saved-count", 'id="saved-count"' in html)
print("session-bridge", any("session-bridge.js" in (row.get("js") or []) for row in (man2.get("content_scripts") or []) if isinstance(row, dict)))
print("hosted", HOSTED)
print("next: chrome://extensions Remove + Load unpacked", ext)
`;

export const TRY_PULL_THEN_PATCH_SH = [
  '# zsh — python, not HTML. Find your clone, try pull, skip github.com DNS, then python3.',
  'eval "$(python3 - <<\'PY\'',
  FIND_LOCAL_PATH_PY.trimEnd(),
  'PY',
  ')"',
  'if [ -z "${KS_ROOT:-}" ]; then echo "no KeyShield folder found"; exit 1; fi',
  'cd "$KS_ROOT" || exit 1',
  'echo "using $KS_ROOT"',
  'echo "ext $KS_EXT"',
  `if git fetch origin ${PATCH_BRANCH}; then`,
  `  git checkout ${PATCH_BRANCH}`,
  `  git pull origin ${PATCH_BRANCH} || echo "pull failed — continue python3"`,
  'else',
  '  echo "github.com 解析失败就跳过，直接跑下面的 python3"',
  'fi',
  'python3 src/extension/patch-signed-popup.py 2>/dev/null || python3 - <<\'PY\'',
  OFFLINE_PATCH_PY.trimEnd(),
  'PY',
  'echo "must see: ver 1.2.4  and  signed-pane True  and  session-bridge True"',
].join('\n') + '\n';

export const DETECT_AFTER_PATCH = [
  'chrome://extensions → Remove the leftover card (Reload is not enough — even 1.2.4 can miss session-bridge.js)',
  'Load unpacked → the KS_EXT / src/extension folder the terminal printed',
  'Card name KeyShield — Sovereign Vault, version 1.2.4',
  'Details → loaded manifest.json must list session-bridge.js at document_start on app.ks.aileena.xyz — only content.js on <all_urls> stays no token',
  'Open popup: green ok 1.2.4 <all_urls>',
  'Refresh https://app.ks.aileena.xyz so session-bridge injects, then popup shows N saved',
  'Already signed: only Saved APIs + Sign out — no Sign-in / token paste',
  'Keep cursor.com / openai / openrouter open, click Show, save sk-proj- / sk-or- / key_ / crsr_ / helius_auth_',
] as const;
