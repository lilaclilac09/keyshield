import { describe, expect, it } from "vitest";
import {
  classifyDetectedKey,
  harvestKeysFromPageText,
  formatHarvestSaveResult,
  DETECT_READY_OK,
  DETECT_READY_LATEST_LABEL,
  formatDetectReadyLine,
  formatLatestVersionLine,
  formatSavedCount,
  formatCollectedCount,
  formatFilledLine,
  formatPopupMs,
  formatSignedStatus,
  buildDetectPanelModel,
  shouldShowDetectSignin,
  DETECT_STATUS_CARD_ID,
  isExtensionContextDead,
  looksLikeSessionToken,
  shouldRetryBackgroundSend,
  shouldArmLiveScan,
  shouldPopupForKey,
  summarizeSavedApis,
  formatApiRowTitle,
  formatApiRowNote,
} from "../src/web/lib/ext-detect";
import { formatStoredApiCard } from "../src/web/lib/provider-catalog";

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
    expect(classifyDetectedKey("10470584-67a9-4abc-8def-123456787761")?.upstream).toBe("helius");
  });

  it("harvests every Helius SOL UUID on dashboard.helius.dev", () => {
    const text = [
      "10470584-67a9-4abc-8def-123456787761",
      "ba5bbc06-d3ee-4abc-8def-123456783876",
      "396e9e16-89f9-4abc-8def-12345678e555",
      "e38b4ee1-e7ab-4abc-8def-12345678736a",
      "221dc279-15f9-4abc-8def-123456782973",
    ].join("\n");
    const rows = harvestKeysFromPageText({
      text,
      hostname: "dashboard.helius.dev",
      href: "https://dashboard.helius.dev/accounts/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/api-keys",
    });
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.upstream === "helius")).toBe(true);
    expect(rows.map((row) => row.key)).not.toContain("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(harvestKeysFromPageText({
      text: "10470584-67a9-••••••••7761",
      hostname: "dashboard.helius.dev",
    })).toEqual([]);
    expect(formatHarvestSaveResult({ saved: 5, failed: 0 })).toBe("Saved 5 keys to KeyShield vault.");
    expect(formatHarvestSaveResult({ saved: 0, failed: 5, queued: 5 })).toBe("Saved 5 keys to KeyShield vault.");
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

describe("formatSavedCount", () => {
  it("prints 0 saved / 1 saved / N saved", () => {
    expect(formatSavedCount(0)).toBe("0 saved");
    expect(formatSavedCount(1)).toBe("1 saved");
    expect(formatSavedCount(3)).toBe("3 saved");
    expect(looksLikeSessionToken("ksv2_abcdefghij")).toBe(true);
    expect(looksLikeSessionToken("short")).toBe(false);
  });
});

describe("1.2 popup status lines", () => {
  it("prints signed + collected + filled · ms", () => {
    expect(formatSignedStatus(true)).toBe("signed");
    expect(formatSignedStatus(false)).toBe("Sign in");
    expect(formatCollectedCount(0)).toBe("0 collected");
    expect(formatCollectedCount(1)).toBe("1 collected");
    expect(formatCollectedCount(5)).toBe("5 collected");
    expect(formatPopupMs(48)).toBe("48ms");
    expect(formatPopupMs(null)).toBe("—");
    expect(formatFilledLine({ filled: 0 })).toBe("0 filled · —");
    expect(formatFilledLine({ filled: 2, ms: 48 })).toBe("2 filled · 48ms");
    expect(formatFilledLine({ filled: 1, ms: 12 })).toBe("1 filled · 12ms");
  });

  it("builds the single on-page detect card: signed + collected + filled, no Sign in when signed", () => {
    const model = buildDetectPanelModel({
      signed: true,
      collected: [
        { upstream: "helius", masked: "1047••••7761", saved: true },
        { upstream: "helius", masked: "ba5b••••3876", saved: true },
      ],
      saved: 2,
      failed: 0,
      filled: 0,
      ms: 42,
    });
    expect(model.signed).toBe("signed");
    expect(model.collected).toBe("2 collected");
    expect(model.filled).toBe("0 filled · 42ms");
    expect(model.save).toBe("Saved 2 keys to KeyShield vault.");
    expect(model.showSignin).toBe(false);
    expect(shouldShowDetectSignin(true)).toBe(false);
    expect(shouldShowDetectSignin(false)).toBe(true);
    expect(DETECT_STATUS_CARD_ID).toBe("keyshield-status-card");
  });
});

describe("formatDetectReadyLine", () => {
  it("prints the exact ok 1.2.5 <all_urls> line and still accepts leftover 1.2.4", () => {
    expect(formatDetectReadyLine({ version: "1.2.5", hasAllUrls: true })).toEqual({
      ok: true,
      text: "ok 1.2.5 <all_urls>",
    });
    expect(formatDetectReadyLine({ version: "1.2.4", hasAllUrls: true })).toEqual({
      ok: true,
      text: "ok 1.2.4 <all_urls>",
    });
    expect(DETECT_READY_OK).toBe("ok 1.2.5 <all_urls>");
    expect(DETECT_READY_LATEST_LABEL).toBe("1.2.5 · latest");
    expect(formatLatestVersionLine("1.2.5")).toBe("1.2.5 · latest");
    expect(formatLatestVersionLine("1.2.4")).toBe("1.2.4");
  });

  it("tells the user to Remove + Load unpacked when <all_urls> is missing", () => {
    expect(formatDetectReadyLine({ version: "1.2.4", hasAllUrls: false }).text).toContain(
      "Remove + Load unpacked",
    );
    expect(formatDetectReadyLine({ version: "1.1.3", hasAllUrls: true }).ok).toBe(false);
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
      {
        id: "groq",
        upstream: "groq",
        name: "groq key",
        masked: "encrypted",
        family: "",
        product: "",
        domain: "",
        expires_at: null,
        created_at: null,
        notes: "",
      },
    ]);
  });

  it("keeps family, product, expiry so two Helius rows stay distinct", () => {
    const rows = summarizeSavedApis([
      {
        id: "1",
        upstream: "helius",
        name: "Helius RPC · Solana RPC · 104705••••7761 · dashboard.helius.dev",
        family: "RPC",
        product: "Solana RPC",
        domain: "dashboard.helius.dev",
        masked_value: "104705••••7761",
        expires_at: "2026-11-11T00:00:00Z",
      },
      {
        id: "2",
        upstream: "helius",
        name: "Helius RPC · Solana RPC · 210e4c••••aaa1 · dashboard.helius.dev",
        family: "RPC",
        product: "Solana RPC",
        domain: "dashboard.helius.dev",
        masked_value: "210e4c••••aaa1",
        expires_at: "2026-11-11T00:00:00Z",
      },
    ]);
    expect(rows[0].name).not.toBe(rows[1].name);
    expect(formatApiRowTitle(rows[0])).toContain("104705");
    expect(formatApiRowTitle(rows[1])).toContain("210e4c");
    expect(formatApiRowNote(rows[0])).toContain("RPC");
    const a = formatStoredApiCard({ upstream: "helius", prefix: "104705••••7761" });
    const b = formatStoredApiCard({ upstream: "helius", prefix: "210e4c••••aaa1" });
    expect(a.title).not.toBe(b.title);
    expect(a.subtitle).toContain("RPC");
    expect(formatStoredApiCard({ upstream: "anthropic", family: "AI", product: "Claude" }).subtitle).toContain("AI");
  });
});

describe("extension context after Remove + Load unpacked", () => {
  it("does not retry Extension context invalidated", () => {
    expect(isExtensionContextDead("Error: Extension context invalidated.")).toBe(true);
    expect(shouldRetryBackgroundSend("Error: Extension context invalidated.")).toBe(false);
    expect(shouldRetryBackgroundSend("Receiving end does not exist.")).toBe(true);
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
