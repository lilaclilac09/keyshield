/**
 * Troubleshooting leftover case: Load unpacked 1.2.4 + github.com DNS fail.
 * Find the clone from Chrome internals (Preferences path) and a home walk —
 * do not hardcode ~/Downloads/privacy_hack/keyshield.
 * Render at the bottom of Docs & Troubleshooting. Home has no leftover card
 * and no python stamp trunks.
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
  symptom:
    'Card can already say KeyShield — Sovereign Vault 1.2.4 and ok 1.2.4 <all_urls>, but the leftover popup still stacks Fill / Copy / Settings / token box, and chrome://extensions → Details → loaded manifest.json only lists content.js on <all_urls>. Hosted Sign-in never writes chrome.storage — title jams into no token. git pull cannot resolve github.com.',
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

export const DEVICE_SAVE_CHECKLIST = [
  'Reload the installed extension from chrome://extensions if its UI is stale.',
  'Open the dashboard Device Vault and unlock or create your vault.',
  'Paste or enter each individual credential yourself in Vault, then Save.',
  'New keys stay encrypted on this device; only vault ciphertext is synced.',
  'Save + Call skips the hosted call for device-local keys.',
] as const;
