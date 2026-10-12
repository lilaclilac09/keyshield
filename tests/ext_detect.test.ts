import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyDetectedKey,
  harvestKeysFromPageText,
  formatHarvestSaveResult,
  DETECT_READY_OK,
  DETECT_READY_VERSION,
  formatDetectReadyLine,
  ensureManifestContentScripts,
  formatBulkSaveFailure,
  formatSavedCount,
  formatCollectedCount,
  listedVaultCount,
  popupVaultHero,
  popupHeroAgreesWithListed,
  formatFilledLine,
  formatPopupMs,
  formatSignedStatus,
  buildDetectPanelModel,
  shouldShowDetectSignin,
  DETECT_STATUS_CARD_ID,
  manifestDropsDefaultPopup,
  isCompactPopupHtml,
  shouldRewritePopupHtml,
  isExtensionContextDead,
  isLeftoverContentOnlyManifest,
  looksLikeSessionToken,
  shouldRetryBackgroundSend,
  manifestHasSessionBridge,
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

  it("hero matches listed vault rows — leftover 0 saved over 5 helius is wrong", () => {
    const helius = [
      { upstream: "helius", masked: "396e9e••••e555" },
      { upstream: "helius", masked: "e38b4e••••736a" },
      { upstream: "helius", masked: "ba5bbc••••3876" },
      { upstream: "helius", masked: "104705••••7761" },
      { upstream: "helius", masked: "encrypted" },
    ];
    expect(listedVaultCount(helius, 5)).toBe(5);
    expect(listedVaultCount([], 5)).toBe(5);
    expect(popupVaultHero(5)).toEqual({ saved: "5 saved", collected: "5 collected" });
    expect(popupHeroAgreesWithListed("0 saved", 5)).toBe(false);
    expect(popupHeroAgreesWithListed("5 saved", 5)).toBe(true);
    const popup = readFileSync(resolve(__dirname, "../src/extension/popup.js"), "utf8");
    const html = readFileSync(resolve(__dirname, "../src/extension/popup.html"), "utf8");
    expect(popup).toContain("function listedApiCount");
    expect(popup).toContain("hideLeftoverCopyButtons");
    expect(popup).toContain("signedEl.textContent = signedIn ? saved");
    expect(popup).not.toContain("return formatCollectedCount(n)");
    expect(html).toContain('id="signed-status" class="saved-count">0 saved');
    expect(html).toContain('id="saved-count" class="sub">0 saved');
    const leftover = readFileSync(resolve(__dirname, "fixtures/leftover-zero-saved-popup.html"), "utf8");
    expect(leftover).toContain(">0 saved<");
    expect(leftover.match(/class="api-row"/g)?.length).toBe(5);
    expect(popupHeroAgreesWithListed("0 saved", leftover.match(/class="api-row"/g)?.length || 0)).toBe(false);
    expect(shouldRewritePopupHtml(leftover)).toBe(true);
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

  it("toolbar click does not open a second popup window", () => {
    const root = resolve(__dirname, "..");
    const man = JSON.parse(readFileSync(resolve(root, "src/extension/manifest.json"), "utf8"));
    const firefox = JSON.parse(readFileSync(resolve(root, "src/extension/manifest.firefox.json"), "utf8"));
    expect(manifestDropsDefaultPopup(man)).toBe(true);
    expect(manifestDropsDefaultPopup(firefox)).toBe(true);
    expect(JSON.stringify(man.action || {})).not.toContain("popup.html");
    const background = readFileSync(resolve(root, "src/extension/background.js"), "utf8");
    expect(background).toContain("function pushDetectState");
    expect(background).toContain("toolbarAction.onClicked");
    expect(background).toContain("KS_DETECT_STATE");
    expect(background).not.toContain("default_popup");
    const content = readFileSync(resolve(root, "src/extension/content.js"), "utf8");
    expect(content).toContain("function applyHarvestState");
    expect(content).toContain("KS_SHOW_DETECT_PANEL");
    expect(content).toContain("detect on · ok 1.2.4");
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
    expect(html).toContain('id="row-auth"');
    expect(html).toContain('id="row-detect"');
    expect(html).toContain('id="row-copy"');
    expect(html).toContain('id="detect-line"');
    expect(html).toContain('id="copy-status"');
    expect(html).toContain('id="signed-status"');
    expect(html).toContain('id="collected-line"');
    expect(html).toContain('id="filled-line"');
    expect(html).toContain('id="fill-ms"');
    expect(html).toContain("Copy Cursor key");
    expect(html).toContain('id="fingerprint"');
    expect(html).not.toContain("<details");
    expect(html).not.toContain("Register token");
    expect(html).not.toContain("Fill this tab");
    expect(html).not.toContain("Sign in to KeyShield");
    expect(html).not.toContain("Allow detect + auto-save");
    expect(isCompactPopupHtml(html)).toBe(true);
    expect(shouldRewritePopupHtml(html)).toBe(false);
    expect(isCompactPopupHtml('<h1>KeyShield — Sovereign Vault</h1><details><summary>Settings</summary></details>')).toBe(false);
    expect(shouldRewritePopupHtml('<h1>KeyShield — Sovereign Vault<span id="conn">no token</span></h1><button>Fill this tab</button><button>Register token</button><details><summary>Settings</summary></details>')).toBe(true);
    expect(shouldRewritePopupHtml('<body data-ui="three-line"><div id="signed-pane"></div><p id="saved-count"></p><div id="saved-apis"></div></body>')).toBe(true);
    const ugly = readFileSync(resolve(root, "tests/fixtures/leftover-ugly-popup.html"), "utf8");
    expect(shouldRewritePopupHtml(ugly)).toBe(true);
    expect(isCompactPopupHtml(ugly)).toBe(false);
    expect(popup).toContain("function formatCollectedCount");
    expect(popup).toContain("function formatFilledLine");
    expect(popup).toContain("function refreshFillStatus");
    expect(popup).toContain("function paintSignedStatus");
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

  it("dead toast is replaced by one harvest card that writes the vault", () => {
    const fail = formatBulkSaveFailure({
      saved: 0,
      failed: 4,
      reason: "extension-dead",
      detail: "Error: Extension context invalidated.",
    });
    expect(fail.reload).toBe(true);
    expect(fail.text).toContain("Saved 0, 4 failed.");
    expect(fail.text).toContain("writing the vault");
    expect(fail.text).toContain("Dead toast cannot save");
    expect(fail.text).not.toContain("Extension messaging error");
    const invalidated = formatBulkSaveFailure({
      saved: 0,
      failed: 8,
      reason: "extension",
      detail: "Error: Extension context invalidated.",
    });
    expect(invalidated.reload).toBe(true);
    expect(invalidated.text).toContain("writing the vault");
    expect(invalidated.text).not.toContain("Extension messaging error");
    const content = readFileSync(resolve(__dirname, "../src/extension/content.js"), "utf8");
    expect(content).toContain("function formatBulkSaveFailure");
    expect(content).toContain("function takeOverStaleDetectPanel");
    expect(content).toContain("keyshield-status-card");
    expect(content).toContain("extension-dead");
    expect(content).toContain("markExtensionContextDead");
    expect(content).not.toContain("Sign in to KeyShield");
    expect(content).not.toContain("Refresh this tab");
    const background = readFileSync(resolve(__dirname, "../src/extension/background.js"), "utf8");
    expect(background).toContain("function harvestVisibleKeysFromText");
    expect(background).toContain("function collectPageSecrets");
    expect(background).toContain("function paintLiveDetectPanel");
    expect(background).toContain("dashboard.helius.dev");
    expect(background).toContain("directStore({");
    expect(background).toContain("upstream: hit.upstream");
    expect(background).toContain("value: hit.key");
    expect(background).not.toContain("function stripStaleDetectPanel");
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
