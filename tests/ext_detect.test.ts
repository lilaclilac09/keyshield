import { describe, expect, it } from "vitest";
import {
  classifyDetectedKey,
  DETECT_READY_OK,
  formatDetectReadyLine,
  shouldArmLiveScan,
  shouldPopupForKey,
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
