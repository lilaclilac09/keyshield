import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyDetectedKey,
  DETECT_READY_OK,
  DETECT_READY_VERSION,
  formatDetectReadyLine,
  ensureManifestContentScripts,
  formatSavedCount,
  isCompactPopupHtml,
  isLeftoverContentOnlyManifest,
  looksLikeSessionToken,
  manifestHasSessionBridge,
  shouldArmLiveScan,
  shouldPopupForKey,
  summarizeSavedApis,
} from "../src/web/lib/ext-detect";

describe("classifyDetectedKey", () => {
  it("matches OpenAI project keys anywhere", () => {
    const hit = classifyDetectedKey("here sk-proj-LOCALDETECTDEMOKEY1234567890abcd");
    expect(hit?.upstream).toBe("openai");
    expect(hit?.key.startsWith("sk-proj-")).toBe(true);
  });

  it("matches Cursor user API keys on cursor.com settings", () => {
    expect(classifyDetectedKey("key_cursorUserApiKey1234567890abcd")?.upstream).toBe("cursor");
    expect(classifyDetectedKey("crsr_abcDEF1234567890")?.upstream).toBe("cursor");
  });

  it("matches OpenRouter / Groq / Helius prefixes", () => {
    expect(classifyDetectedKey("sk-or-v1-abcdefghijkl")?.upstream).toBe("openrouter");
    expect(classifyDetectedKey("gsk_" + "a".repeat(40))?.upstream).toBe("groq");
    expect(classifyDetectedKey("helius_auth_" + "b".repeat(20))?.upstream).toBe("helius");
  });

  it("ignores ordinary sentences", () => {
    expect(classifyDetectedKey("no secret here")).toBeNull();
  });
});

describe("shouldPopupForKey", () => {
  it("pops every time a live key is visible, even if the panel was closed", () => {
    expect(shouldPopupForKey({ alreadySaved: false, panelOpen: false })).toBe(true);
    expect(shouldPopupForKey({ alreadySaved: false, panelOpen: true })).toBe(true);
  });

  it("does not re-toast a key that already saved", () => {
    expect(shouldPopupForKey({ alreadySaved: true, panelOpen: false })).toBe(false);
  });
});

describe("manifestHasSessionBridge", () => {
  it("rejects the leftover 1.2.4 stamp that only injects content.js", () => {
    const leftover = JSON.parse(
      readFileSync(resolve(__dirname, "fixtures/leftover-124-content-only.manifest.json"), "utf8"),
    );
    expect(leftover.version).toBe("1.2.4");
    expect(leftover.name).toContain("KeyShield");
    expect(leftover.host_permissions).toContain("<all_urls>");
    expect(manifestHasSessionBridge(leftover)).toBe(false);
    expect(isLeftoverContentOnlyManifest(leftover)).toBe(true);
    const fixed = ensureManifestContentScripts({ ...leftover });
    expect(manifestHasSessionBridge(fixed)).toBe(true);
    expect(isLeftoverContentOnlyManifest(fixed)).toBe(false);
    expect(fixed.content_scripts?.[0].js).toEqual(["session-bridge.js"]);
    expect(fixed.content_scripts?.[0].run_at).toBe("document_start");
    expect(JSON.stringify(fixed.content_scripts)).toContain("app.ks.aileena.xyz");
  });
});

describe("formatSavedCount", () => {
  it("prints 0 saved / 1 saved / N saved", () => {
    expect(formatSavedCount(0)).toBe("0 saved");
    expect(formatSavedCount(1)).toBe("1 saved");
    expect(formatSavedCount(3)).toBe("3 saved");
    expect(looksLikeSessionToken("ksv2_abcdefghij")).toBe(true);
    expect(looksLikeSessionToken("short")).toBe(false);
  });
});

describe("formatDetectReadyLine", () => {
  it("prints the exact ok 1.2.4 <all_urls> line", () => {
    expect(formatDetectReadyLine({ version: "1.2.4", hasAllUrls: true })).toEqual({
      ok: true,
      text: "ok 1.2.4 <all_urls>",
    });
    expect(DETECT_READY_OK).toBe("ok 1.2.4 <all_urls>");
  });

  it("tells the user to Remove + Load unpacked when <all_urls> is missing", () => {
    expect(formatDetectReadyLine({ version: "1.2.4", hasAllUrls: false }).text).toContain(
      "Remove + Load unpacked",
    );
    expect(formatDetectReadyLine({ version: "1.1.3", hasAllUrls: true }).ok).toBe(false);
  });

  it("Load unpacked src/extension is 1.2.4 and popup.js parses without merge markers", () => {
    const root = resolve(__dirname, "..");
    const man = JSON.parse(readFileSync(resolve(root, "src/extension/manifest.json"), "utf8"));
    const firefox = JSON.parse(readFileSync(resolve(root, "src/extension/manifest.firefox.json"), "utf8"));
    const popup = readFileSync(resolve(root, "src/extension/popup.js"), "utf8");
    const html = readFileSync(resolve(root, "src/extension/popup.html"), "utf8");
    const localDetect = readFileSync(resolve(root, "src/extension/LOCAL-DETECT.md"), "utf8");
    const localSignin = readFileSync(resolve(root, "src/extension/LOCAL-SIGNIN.md"), "utf8");
    expect(man.name).toBe("KeyShield — Sovereign Vault");
    expect(man.version).toBe(DETECT_READY_VERSION);
    expect(manifestHasSessionBridge(man)).toBe(true);
    expect(JSON.stringify(man.content_scripts)).toContain("session-bridge.js");
    expect(firefox.version).toBe(DETECT_READY_VERSION);
    expect(DETECT_READY_VERSION).toBe("1.2.4");
    expect(popup).not.toMatch(/<<<<<<<|>>>>>>>/);
    expect(popup).toContain('if (ver === "1.2.4" && hasAllUrls)');
    expect(popup).toContain("ok 1.2.4 <all_urls>");
    expect(popup).toContain("function bootPopup");
    expect(popup).toContain("function applySignedInChrome");
    expect(html).toContain("ok 1.2.4");
    expect(html).toContain('id="signed-pane"');
    expect(html).toContain('id="saved-count"');
    expect(html).toContain('id="saved-apis"');
    expect(html).toContain('data-ui="three-line"');
    expect(html).toContain('id="fingerprint"');
    expect(html).not.toContain("<details");
    expect(isCompactPopupHtml(html)).toBe(true);
    expect(isCompactPopupHtml('<h1>KeyShield — Sovereign Vault</h1><details><summary>Settings</summary></details>')).toBe(false);
    expect(html).toContain("KeyShield — Sovereign Vault");
    expect(popup).toContain("function harvestTokenFromDashboardTabs");
    expect(popup).toContain("function formatSavedCount");
    expect(popup).toContain("function paintSavedCount");
    expect(readFileSync(resolve(root, "src/extension/session-bridge.js"), "utf8")).toContain("function capturePageToken");
    const content = readFileSync(resolve(root, "src/extension/content.js"), "utf8");
    expect(content).toContain("crypto-regime-api.onrender.com");
    expect(content).toContain("function ksIsX402Challenge");
    expect(localDetect).toContain('man["version"] = "1.2.4"');
    expect(localDetect).toContain("session-bridge.js");
    expect(localDetect).toContain('man["content_scripts"]');
    expect(localDetect).toContain("signed-pane");
    expect(localDetect).toContain("patch-signed-popup.py");
    expect(localDetect).toContain("patch-leftover-bridge.py");
    expect(localSignin).toContain('"version": "1.2.4"');
    expect(readFileSync(resolve(root, "src/extension/patch-signed-popup.py"), "utf8")).toContain("signed-pane");
  });
});

describe("summarizeSavedApis", () => {
  it("lists only masked rows and drops raw value", () => {
    const rows = summarizeSavedApis([
      { id: "1", upstream: "openai", name: "openai key", masked_value: "sk-proj-••••ONL", value: "sk-proj-SECRET" },
      { id: "2", upstream: "helius", masked_value: "helius••••1234" },
    ]);
    expect(rows.map((r) => r.upstream)).toEqual(["openai", "helius"]);
    expect(JSON.stringify(rows)).not.toContain("SECRET");
    expect(rows[0].masked).toContain("••••");
  });

  it("accepts {items} payloads and cipher-only rows", () => {
    expect(summarizeSavedApis({ items: [{ upstream: "groq", cipher: "abc" }] })).toEqual([
      { id: "groq", upstream: "groq", name: "groq key", masked: "encrypted" },
    ]);
  });
});

describe("shouldArmLiveScan", () => {
  it("arms after login even without the Allow click", () => {
    expect(shouldArmLiveScan({ loggedIn: true, autoStorePref: false })).toBe(true);
  });

  it("stays off before login unless Allow was already granted", () => {
    expect(shouldArmLiveScan({ loggedIn: false, autoStorePref: false })).toBe(false);
    expect(shouldArmLiveScan({ loggedIn: false, autoStorePref: true })).toBe(true);
  });
});
