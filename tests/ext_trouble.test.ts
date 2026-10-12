import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  CHROME_INTERNALS_PREF_ROOTS,
  DETECT_AFTER_PATCH,
  FIND_LOCAL_PATH_PY,
  FIND_WALK_ROOTS,
  LEFTOVER_121_CASE,
  OFFLINE_PATCH_PY,
  PATCH_BRANCH,
  PATCH_VERSION,
  TRY_PULL_THEN_PATCH_SH,
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
    expect(TRY_PULL_THEN_PATCH_SH).toContain("github.com 解析失败就跳过，直接跑下面的 python3");
    expect(TRY_PULL_THEN_PATCH_SH).toContain("python3 src/extension/patch-signed-popup.py");
    expect(TRY_PULL_THEN_PATCH_SH).toContain("ver 1.2.4");
    expect(TRY_PULL_THEN_PATCH_SH).toContain("signed-pane True");
  });

  it("offline python stamps 1.2.4 signed-pane and LIST_SAVED_APIS", () => {
    expect(PATCH_VERSION).toBe("1.2.4");
    expect(OFFLINE_PATCH_PY).toContain('man["version"] = VER');
    expect(OFFLINE_PATCH_PY).toContain("1.2.4");
    expect(OFFLINE_PATCH_PY).toContain('id="signed-pane"');
    expect(OFFLINE_PATCH_PY).toContain('id="saved-count"');
    expect(OFFLINE_PATCH_PY).toContain("<details");
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
    expect(DETECT_AFTER_PATCH.join(" ")).toContain("sk-proj-");
    const docs = readFileSync(resolve(root, "src/web/components/sections/DocsSection.tsx"), "utf8");
    const home = readFileSync(resolve(root, "src/web/components/sections/HomeSection.tsx"), "utf8");
    const caseUi = readFileSync(resolve(root, "src/web/components/ExtTroubleCase.tsx"), "utf8");
    const hint = readFileSync(resolve(root, "src/web/components/ExtensionInstallHint.tsx"), "utf8");
    const token = readFileSync(resolve(root, "src/web/components/ExtensionTokenCopy.tsx"), "utf8");
    const localDetect = readFileSync(resolve(root, "src/extension/LOCAL-DETECT.md"), "utf8");
    expect(docs).toContain("ExtTroubleCase");
    expect(home).toContain("ExtTroubleCase");
    expect(caseUi).toContain("ext-trouble-leftover-121");
    expect(hint).toContain("Chrome internals");
    expect(hint).not.toContain("~/Downloads/privacy_hack/keyshield");
    expect(token).toContain("Trouble");
    expect(localDetect).toContain("Chrome internals");
    expect(localDetect).toContain('man["version"] = "1.2.4"');
    expect(localDetect).toContain("signed-pane");
    expect(localDetect).toContain("patch-signed-popup.py");
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
