import { describe, expect, it } from "vitest";
import { classifyDetectedKey, shouldPopupForKey } from "../src/web/lib/ext-detect";

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
