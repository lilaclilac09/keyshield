import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  CHROME_INTERNALS_PREF_ROOTS,
  DETECT_AFTER_PATCH,
  FIND_LOCAL_PATH_PY,
  FIND_WALK_ROOTS,
  LEFTOVER_121_CASE,
  LOCAL_PULL_BRIDGE_SH,
  OFFLINE_BRIDGE_STAMP_PY,
  OFFLINE_PATCH_PY,
  PATCH_BRANCH,
  PATCH_VERSION,
  TRY_PULL_THEN_PATCH_SH,
  ZSH_SAFE_STAMP_PY,
  isZshSafePullBlock,
  isKeyshieldExtManifest,
  repoRootFromExt,
  shouldSkipGitPull,
} from "../src/web/lib/ext-trouble";

const root = resolve(__dirname, "..");

describe("leftover 1.2.1 Trouble case", () => {
  it("finds a KeyShield ext folder and repo root without a hardcoded Downloads path", () => {
    expect(repoRootFromExt("/Users/me/src/keyshield/src/extension")).toBe("/Users/me/src/keyshield");
    expect(repoRootFromExt("/Users/me/extension")).toBe("/Users/me");
    expect(isKeyshieldExtManifest({ name: "KeyShield — Sovereign Vault" })).toBe(true);
    expect(isKeyshieldExtManifest({ name: "Other" })).toBe(false);
    expect(FIND_LOCAL_PATH_PY).toContain("Library/Application Support/Google/Chrome");
    expect(FIND_LOCAL_PATH_PY).toContain("*/Preferences");
    expect(FIND_LOCAL_PATH_PY).toContain("chrome-internals");
    expect(FIND_LOCAL_PATH_PY).toContain("manifest.json");
    expect(FIND_LOCAL_PATH_PY).toContain("popup.js");
    expect(FIND_WALK_ROOTS).toContain("~/Downloads");
    expect(FIND_WALK_ROOTS).toContain("~/Documents");
    expect(CHROME_INTERNALS_PREF_ROOTS.some((p) => p.includes("Arc"))).toBe(true);
    expect(FIND_LOCAL_PATH_PY).not.toContain("cd to ~/Downloads/privacy_hack/keyshield first");
  });

  it("skips git pull when github.com DNS fails", () => {
    expect(shouldSkipGitPull("Could not resolve hostname github.com")).toBe(true);
    expect(shouldSkipGitPull("nodename nor servname provided, or not known")).toBe(true);
    expect(shouldSkipGitPull("Name or service not known")).toBe(true);
    expect(TRY_PULL_THEN_PATCH_SH).toContain(`git fetch origin ${PATCH_BRANCH}`);
    expect(TRY_PULL_THEN_PATCH_SH).toContain("github.com DNS failed — skip git, run python3 below");
    expect(TRY_PULL_THEN_PATCH_SH).toContain("session-bridge True");
    expect(TRY_PULL_THEN_PATCH_SH).not.toContain("eval ");
    expect(isZshSafePullBlock(LOCAL_PULL_BRIDGE_SH)).toBe(true);
    expect(LOCAL_PULL_BRIDGE_SH).toContain("python3 - <<'PY'");
    expect(LOCAL_PULL_BRIDGE_SH).toContain("session-bridge True");
    expect(LOCAL_PULL_BRIDGE_SH).not.toContain("eval ");
    expect(LOCAL_PULL_BRIDGE_SH).not.toContain("$(");
    expect(ZSH_SAFE_STAMP_PY).toContain("capturePageToken");
    expect(OFFLINE_BRIDGE_STAMP_PY).toContain("capturePageToken");
    expect(OFFLINE_BRIDGE_STAMP_PY).toContain("session-bridge.js");
    expect(OFFLINE_BRIDGE_STAMP_PY).toContain('data-ui="three-line"');
    expect(OFFLINE_BRIDGE_STAMP_PY).toContain('id="detect-line"');
    expect(OFFLINE_BRIDGE_STAMP_PY).toContain('id="copy-status"');
    expect(OFFLINE_BRIDGE_STAMP_PY).toContain("<!DOCTYPE html>");
    expect(ZSH_SAFE_STAMP_PY).toContain('data-ui="three-line"');
    expect(ZSH_SAFE_STAMP_PY).toContain('id="detect-line"');
    expect(ZSH_SAFE_STAMP_PY).toContain('id="copy-status"');
    expect(ZSH_SAFE_STAMP_PY).toContain("ensure_three_line_popup");
  });

  it("offline python stamps 1.2.4 signed-pane and LIST_SAVED_APIS", () => {
    expect(PATCH_VERSION).toBe("1.2.4");
    expect(OFFLINE_PATCH_PY).toContain('man["version"] = VER');
    expect(OFFLINE_PATCH_PY).toContain("1.2.4");
    expect(OFFLINE_PATCH_PY).toContain('id="signed-pane"');
    expect(OFFLINE_PATCH_PY).toContain('id="saved-count"');
    expect(OFFLINE_PATCH_PY).toContain("session-bridge.js");
    expect(OFFLINE_PATCH_PY).toContain("document_start");
    expect(OFFLINE_PATCH_PY).toContain("capturePageToken");
    expect(OFFLINE_PATCH_PY).toContain('print("session-bridge"');
    expect(OFFLINE_PATCH_PY).toContain("https://*.vercel.app/*");
    expect(OFFLINE_PATCH_PY).toContain('data-ui="three-line"');
    expect(OFFLINE_PATCH_PY).toContain('id="detect-line"');
    expect(OFFLINE_PATCH_PY).toContain('id="copy-status"');
    expect(OFFLINE_PATCH_PY).not.toContain("<summary>Settings");
    expect(OFFLINE_PATCH_PY).toContain("KS-SIGNED-1.2.4");
    expect(OFFLINE_PATCH_PY).toContain("LIST_SAVED_APIS");
    expect(OFFLINE_PATCH_PY).toContain("Library/Application Support/Google/Chrome");
    expect(OFFLINE_PATCH_PY).toContain("*/Preferences");
    expect(OFFLINE_PATCH_PY).toContain('print("ver"');
    expect(OFFLINE_PATCH_PY).toContain('print("signed-pane"');
    expect(OFFLINE_PATCH_PY).not.toContain("cd to ~/Downloads/privacy_hack/keyshield first");
  });

  it("UI and docs surface the case plus detect checklist", () => {
    expect(LEFTOVER_121_CASE.id).toBe("leftover-121");
    expect(DETECT_AFTER_PATCH.join(" ")).toContain("ok 1.2.4 <all_urls>");
    expect(DETECT_AFTER_PATCH.join(" ")).toContain("session-bridge.js");
    expect(DETECT_AFTER_PATCH.join(" ")).toContain("sk-proj-");
    expect(DETECT_AFTER_PATCH.join(" ")).toContain("Save never asks Face ID");
    expect(LEFTOVER_121_CASE.title).toContain("session-bridge");
    expect(LEFTOVER_121_CASE.symptom).toContain("content.js");
    const docs = readFileSync(resolve(root, "src/web/components/sections/DocsSection.tsx"), "utf8");
    const home = readFileSync(resolve(root, "src/web/components/sections/HomeSection.tsx"), "utf8");
    const caseUi = readFileSync(resolve(root, "src/web/components/ExtTroubleCase.tsx"), "utf8");
    const hint = readFileSync(resolve(root, "src/web/components/ExtensionInstallHint.tsx"), "utf8");
    const token = readFileSync(resolve(root, "src/web/components/ExtensionTokenCopy.tsx"), "utf8");
    const localDetect = readFileSync(resolve(root, "src/extension/LOCAL-DETECT.md"), "utf8");
    expect(docs).toContain("ExtTroubleCase");
    expect(docs).toContain("Troubleshooting");
    expect(home).not.toContain("ExtTroubleCase");
    expect(home).toContain("Docs → Troubleshooting");
    expect(caseUi).toContain("ext-trouble-leftover-121");
    expect(hint).toContain("Chrome internals");
    expect(hint).not.toContain("~/Downloads/privacy_hack/keyshield");
    expect(token).toContain("Trouble");
    expect(localDetect).toContain("Chrome internals");
    expect(localDetect).toContain('man["version"] = "1.2.4"');
    expect(localDetect).toContain("signed-pane");
    expect(localDetect).toContain("patch-signed-popup.py");
    expect(localDetect).toContain("patch-leftover-bridge.py");
    expect(localDetect).toContain("session-bridge.js");
    expect(caseUi).toContain("session-bridge True");
    expect(caseUi).toContain("LOCAL_PULL_BRIDGE_SH");
    expect(caseUi).toContain("Do not use eval");
  });

  it("zsh-safe local-pull block parses and stamps leftover 1.2.4", () => {
    const tmpSh = join(mkdtempSync(join(tmpdir(), "ks-zsh-safe-")), "local-pull.sh");
    writeFileSync(tmpSh, LOCAL_PULL_BRIDGE_SH);
    execFileSync("bash", ["-n", tmpSh], { encoding: "utf8" });
    const leftover = readFileSync(
      resolve(root, "tests/fixtures/leftover-124-content-only.manifest.json"),
      "utf8",
    );
    const tmp = mkdtempSync(join(tmpdir(), "ks-zsh-stamp-"));
    writeFileSync(join(tmp, "manifest.json"), leftover);
    writeFileSync(join(tmp, "popup.js"), "/* stub */\n");
    writeFileSync(
      join(tmp, "popup.html"),
      `<html><h1>KeyShield — Sovereign Vault<span id="conn">no token</span></h1><details><summary>Settings</summary></details></html>\n`,
    );
    const out = execFileSync("python3", ["-c", ZSH_SAFE_STAMP_PY], {
      cwd: tmp,
      encoding: "utf8",
    });
    expect(out).toContain("session-bridge True");
    expect(out).toContain("three-line");
    const stamped = JSON.parse(readFileSync(join(tmp, "manifest.json"), "utf8"));
    expect(stamped.content_scripts[0].js).toEqual(["session-bridge.js"]);
    const popup = readFileSync(join(tmp, "popup.html"), "utf8");
    expect(popup).toContain('data-ui="three-line"');
    expect(popup).toContain('id="saved-apis"');
    expect(popup).toContain('id="detect-line"');
    expect(popup).toContain('id="copy-status"');
    expect(popup).toContain('id="signed-status"');
    expect(popup).toContain('id="collected-line"');
    expect(popup).toContain('id="filled-line"');
    expect(popup).toContain('id="fill-ms"');
    expect(popup).toContain("Copy Cursor key");
    expect(popup).not.toContain("<details");
    expect(popup).not.toContain("Fill this tab");
    expect(popup).not.toContain("Register token");
    expect(popup).not.toContain("Sign in to KeyShield");
    expect(popup).not.toContain("Allow detect + auto-save");
  });

  it("patch-leftover-bridge.py stamps leftover 1.2.4 content.js-only", () => {
    const leftover = readFileSync(
      resolve(root, "tests/fixtures/leftover-124-content-only.manifest.json"),
      "utf8",
    );
    const tmp = mkdtempSync(join(tmpdir(), "ks-leftover-bridge-"));
    writeFileSync(join(tmp, "manifest.json"), leftover);
    writeFileSync(join(tmp, "popup.js"), "/* stub */\n");
    writeFileSync(join(tmp, "content.js"), "/* stub */\n");
    writeFileSync(
      join(tmp, "popup.html"),
      `<html><h1>KeyShield — Sovereign Vault<span id="conn">no token</span></h1><button>Fill this tab</button><details><summary>Settings</summary></details></html>\n`,
    );
    const py = `
import importlib.util, json
from pathlib import Path
tmp = Path(${JSON.stringify(tmp)})
spec = importlib.util.spec_from_file_location("bridge", ${JSON.stringify(resolve(root, "src/extension/patch-leftover-bridge.py"))})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
man = json.loads((tmp / "manifest.json").read_text())
assert mod.has_bridge(man) is False
out = mod.stamp(tmp)
assert out["version"] == "1.2.4"
assert mod.has_bridge(out) is True
assert "capturePageToken" in (tmp / "session-bridge.js").read_text()
html = (tmp / "popup.html").read_text()
assert 'data-ui="three-line"' in html
assert 'id="saved-apis"' in html
assert 'id="detect-line"' in html
assert 'id="copy-status"' in html
assert 'id="signed-status"' in html
assert 'id="collected-line"' in html
assert 'id="filled-line"' in html
assert 'id="fill-ms"' in html
assert "Copy Cursor key" in html
assert "<details" not in html
assert "Fill this tab" not in html
assert "LIST_SAVED_APIS" in (tmp / "popup.js").read_text()
assert "LIST_SAVED_APIS" in (tmp / "background.js").read_text()
print("session-bridge", True)
print("three-line", True)
`;
    const out = execFileSync("python3", ["-c", py], { cwd: root, encoding: "utf8" });
    expect(out).toContain("session-bridge True");
    const stamped = JSON.parse(readFileSync(join(tmp, "manifest.json"), "utf8"));
    expect(stamped.content_scripts[0].js).toEqual(["session-bridge.js"]);
    expect(stamped.content_scripts[0].run_at).toBe("document_start");
    expect(JSON.stringify(stamped.action || {})).not.toContain("popup.html");
    expect(readFileSync(join(tmp, "background.js"), "utf8")).toContain("function paintLiveDetectPanel");
    expect(readFileSync(join(tmp, "background.js"), "utf8")).toContain("ksPaintTab");
    expect(readFileSync(join(tmp, "content.js"), "utf8")).toContain("KS-ONE-PANEL-1.2.4");
  });

  it("leftover stamp drops the second popup and rewrites the dead detect toast", () => {
    const leftover = readFileSync(
      resolve(root, "tests/fixtures/leftover-124-content-only.manifest.json"),
      "utf8",
    );
    const tmp = mkdtempSync(join(tmpdir(), "ks-one-panel-"));
    writeFileSync(join(tmp, "manifest.json"), leftover);
    writeFileSync(join(tmp, "popup.js"), "/* stub */\n");
    writeFileSync(
      join(tmp, "content.js"),
      `function buildPanel(){panelEl.id='keyshield-detection-notice'}
<a id="ks-signin">Sign in to KeyShield</a>
<button>Refresh this tab</button>
async function bulkSave(){setPanelStatus('Saved 0, 8 failed. Extension messaging error');}
`,
    );
    writeFileSync(join(tmp, "popup.html"), "<html></html>\n");
    const py = `
import importlib.util, json
from pathlib import Path
tmp = Path(${JSON.stringify(tmp)})
spec = importlib.util.spec_from_file_location("bridge", ${JSON.stringify(resolve(root, "src/extension/patch-leftover-bridge.py"))})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
out = mod.stamp(tmp)
assert "default_popup" not in json.dumps(out.get("action") or {})
html = (tmp / "popup.html").read_text()
assert "Register token" not in html
content = (tmp / "content.js").read_text()
assert "Sign in to KeyShield" not in content
assert "keyshield-status-card" in content
assert "KS-ONE-PANEL-1.2.4" in content
assert "INJECT_DETECT" in content
bg = (tmp / "background.js").read_text()
assert "paintLiveDetectPanel" in bg
assert "ksPaintTab" in bg
assert "/manage/store" in bg
print("one-panel", True)
`;
    const out = execFileSync("python3", ["-c", py], { cwd: root, encoding: "utf8" });
    expect(out).toContain("one-panel True");
  });

  it("rewrites leftover old three-line that hid copy in extra", () => {
    const leftover = readFileSync(
      resolve(root, "tests/fixtures/leftover-124-content-only.manifest.json"),
      "utf8",
    );
    const tmp = mkdtempSync(join(tmpdir(), "ks-old-three-line-"));
    writeFileSync(join(tmp, "manifest.json"), leftover);
    writeFileSync(join(tmp, "popup.js"), "/* stub */\n");
    writeFileSync(join(tmp, "content.js"), "/* stub */\n");
    writeFileSync(
      join(tmp, "popup.html"),
      `<body data-ui="three-line"><div id="signed-pane"></div><p id="saved-count">0 saved</p><div id="saved-apis"></div><button id="signin">Sign in to KeyShield</button><button id="allow-detect">Allow detect + auto-save</button><div class="extra"><button id="copy-cursor-key">Copy key for Cursor API box</button></div></body>\n`,
    );
    const py = `
import importlib.util
from pathlib import Path
tmp = Path(${JSON.stringify(tmp)})
spec = importlib.util.spec_from_file_location("bridge", ${JSON.stringify(resolve(root, "src/extension/patch-leftover-bridge.py"))})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
assert mod.popup_is_three_line((tmp / "popup.html").read_text()) is False
mod.ensure_three_line_popup(tmp)
html = (tmp / "popup.html").read_text()
assert mod.popup_is_three_line(html) is True
assert 'id="detect-line"' in html
assert 'id="copy-status"' in html
assert 'id="signed-status"' in html
assert 'id="collected-line"' in html
assert 'id="filled-line"' in html
assert 'id="fill-ms"' in html
assert "Copy Cursor key" in html
assert "Copy key for Cursor" not in html
assert "Sign in to KeyShield" not in html
print("rewrote-old-three-line", True)
`;
    const out = execFileSync("python3", ["-c", py], { cwd: root, encoding: "utf8" });
    expect(out).toContain("rewrote-old-three-line True");
  });

  it("stamp_manifest restores session-bridge on leftover 1.2.4 content.js-only", () => {
    const leftover = readFileSync(
      resolve(root, "tests/fixtures/leftover-124-content-only.manifest.json"),
      "utf8",
    );
    const tmp = mkdtempSync(join(tmpdir(), "ks-leftover-124-"));
    writeFileSync(join(tmp, "manifest.json"), leftover);
    writeFileSync(join(tmp, "popup.js"), "/* stub */\n");
    writeFileSync(join(tmp, "popup.html"), "<html></html>\n");
    writeFileSync(join(tmp, "background.js"), "/* stub */\n");
    writeFileSync(join(tmp, "content.js"), "/* stub */\n");
    const py = `
import importlib.util, json
from pathlib import Path
tmp = Path(${JSON.stringify(tmp)})
spec = importlib.util.spec_from_file_location("patch", ${JSON.stringify(resolve(root, "src/extension/patch-signed-popup.py"))})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
man = json.loads((tmp / "manifest.json").read_text())
assert mod.manifest_has_session_bridge(man) is False
mod.stamp_manifest(tmp)
man2 = json.loads((tmp / "manifest.json").read_text())
assert man2["version"] == "1.2.4"
assert mod.manifest_has_session_bridge(man2) is True
assert (tmp / "session-bridge.js").is_file()
assert "capturePageToken" in (tmp / "session-bridge.js").read_text()
# leftover copy without sibling file: fallback still writes capturePageToken
bare = tmp / "bare"
bare.mkdir()
(bare / "manifest.json").write_text((tmp / "manifest.json").read_text())
old = getattr(mod, "__file__", None)
try:
    if hasattr(mod, "__file__"):
        delattr(mod, "__file__")
    dest = bare / "session-bridge.js"
    if dest.exists():
        dest.unlink()
    mod.ensure_session_bridge_file(bare)
    assert "capturePageToken" in dest.read_text()
    print("session-bridge", True)
    print("fallback", True)
finally:
    if old is not None:
        mod.__file__ = old
`;
    const out = execFileSync("python3", ["-c", py], { cwd: root, encoding: "utf8" });
    expect(out).toContain("session-bridge True");
    expect(out).toContain("fallback True");
    const stamped = JSON.parse(readFileSync(join(tmp, "manifest.json"), "utf8"));
    expect(stamped.content_scripts[0].js).toEqual(["session-bridge.js"]);
    expect(stamped.content_scripts[0].run_at).toBe("document_start");
    expect(stamped.content_scripts[0].matches).toContain("https://app.ks.aileena.xyz/*");
  });

  it("always overwrites leftover ugly Sign-in/Register/URL popup", () => {
    const leftover = readFileSync(
      resolve(root, "tests/fixtures/leftover-124-content-only.manifest.json"),
      "utf8",
    );
    const ugly = readFileSync(resolve(root, "tests/fixtures/leftover-ugly-popup.html"), "utf8");
    const tmp = mkdtempSync(join(tmpdir(), "ks-leftover-ugly-"));
    writeFileSync(join(tmp, "manifest.json"), leftover);
    writeFileSync(join(tmp, "popup.js"), "/* stub */\n");
    writeFileSync(join(tmp, "content.js"), "/* stub */\n");
    writeFileSync(join(tmp, "popup.html"), ugly);
    const py = `
import importlib.util
from pathlib import Path
tmp = Path(${JSON.stringify(tmp)})
spec = importlib.util.spec_from_file_location("bridge", ${JSON.stringify(resolve(root, "src/extension/patch-leftover-bridge.py"))})
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
assert mod.popup_is_three_line((tmp / "popup.html").read_text()) is False
mod.ensure_three_line_popup(tmp)
html = (tmp / "popup.html").read_text()
assert mod.popup_is_three_line(html) is True
assert "signed" in html
assert "collected" in html
assert "filled" in html
assert 'id="fill-ms"' in html
assert "Register token" not in html
assert "Fill this tab" not in html
assert "Sign in to KeyShield" not in html
assert "Allow detect + auto-save" not in html
assert "https://keyshield-production" not in html
print("rewrote-ugly", True)
`;
    const out = execFileSync("python3", ["-c", py], { cwd: root, encoding: "utf8" });
    expect(out).toContain("rewrote-ugly True");
  });

  it("patch-signed-popup.py --find prints this checkout", () => {
    const py = readFileSync(resolve(root, "src/extension/patch-signed-popup.py"), "utf8");
    expect(py).toContain("chrome-internals");
    expect(py).toContain("Library/Application Support/Google/Chrome");
    expect(py).not.toContain("cd to ~/Downloads/privacy_hack/keyshield first");
    const out = execFileSync("python3", ["src/extension/patch-signed-popup.py", "--find"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(out).toContain("src/extension");
    expect(out).toMatch(/export KS_EXT=/);
    expect(out).toMatch(/export KS_ROOT=/);
    expect(out).toContain("1.2.4");
  });
});
