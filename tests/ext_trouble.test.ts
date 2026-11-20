import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHROME_INTERNALS_PREF_ROOTS, FIND_LOCAL_PATH_PY, FIND_WALK_ROOTS,
  LEFTOVER_121_CASE, DEVICE_SAVE_CHECKLIST, repoRootFromExt,
  isKeyshieldExtManifest, shouldSkipGitPull,
} from "../src/web/lib/ext-trouble";

const root = resolve(__dirname, "..");

describe("safe extension troubleshooting", () => {
  it("retains local extension-path diagnostics without harvesting credentials", () => {
    expect(repoRootFromExt("/Users/me/src/keyshield/src/extension")).toBe("/Users/me/src/keyshield");
    expect(repoRootFromExt("/Users/me/extension")).toBe("/Users/me");
    expect(isKeyshieldExtManifest({ name: "KeyShield — Sovereign Vault" })).toBe(true);
    expect(isKeyshieldExtManifest({ name: "Other" })).toBe(false);
    expect(shouldSkipGitPull("Could not resolve hostname github.com")).toBe(true);
    expect(FIND_LOCAL_PATH_PY).toContain("manifest.json");
    expect(FIND_LOCAL_PATH_PY).toContain("chrome-internals");
    expect(FIND_WALK_ROOTS).toContain("~/Downloads");
    expect(CHROME_INTERNALS_PREF_ROOTS.some((p) => p.includes("Arc"))).toBe(true);
  });

  it("contains no copyable tab-harvesting or plaintext-store repair code", () => {
    const source = readFileSync(resolve(root, "src/web/lib/ext-trouble.ts"), "utf8");
    for (const unsafe of ["ksHarvestAndStoreVisibleKeys", "harvestTokenFromDashboardTabs", "chrome.tabs", "executeScript", "/manage/store", "ks_auto_store", "INJECT_DETECT"]) {
      expect(source).not.toContain(unsafe);
    }
    const ui = readFileSync(resolve(root, "src/web/components/ExtTroubleCase.tsx"), "utf8");
    expect(ui).toContain("FIND_LOCAL_PATH_PY");
    expect(ui).toContain("DEVICE_SAVE_CHECKLIST");
    expect(ui).not.toContain("OFFLINE_PATCH_PY");
    expect(ui).not.toContain("OFFLINE_BRIDGE_STAMP_PY");
    expect(ui).not.toContain("LOCAL_PULL_BRIDGE_SH");
    expect(LEFTOVER_121_CASE.id).toBe("leftover-121");
    expect(DEVICE_SAVE_CHECKLIST.join(" ")).toContain("individual credential");
    expect(DEVICE_SAVE_CHECKLIST.join(" ")).toContain("Save + Call skips");
  });
});
