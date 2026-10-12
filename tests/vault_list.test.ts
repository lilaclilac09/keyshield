import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isLocalApiBase,
  isVaultListPayload,
  parseVaultListPayload,
  shouldRefreshVaultOnVisit,
} from "../src/web/lib/vault-list";
import { needsPasskey } from "../src/web/lib/zk-verify";
import { detectUpstream, extractDetectedKeys } from "../src/web/lib/keychain";
import {
  flushPendingVaultHits,
  previewPendingVaultHits,
  mergeVaultRows,
  pendingHitsToFillKeys,
  maskVaultPreview,
} from "../src/web/lib/vault-list";

const root = resolve(__dirname, "..");

describe("parseVaultListPayload", () => {
  it("keeps a raw array from /manage/vault", () => {
    const rows = parseVaultListPayload([
      { id: "ks_1", upstream: "openai", name: "OpenAI" },
      { id: "ks_2", upstream: "helius", name: "Helius" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].upstream).toBe("openai");
  });

  it("unwraps items/keys envelopes so five saved keys are not dropped", () => {
    expect(parseVaultListPayload({ items: [{ id: "a", upstream: "openai" }] })).toHaveLength(1);
    expect(parseVaultListPayload({ keys: [{ id: "b", upstream: "groq" }] })).toHaveLength(1);
  });

  it("does not treat a failed body as an empty vault", () => {
    expect(parseVaultListPayload({ detail: "unauthorized" })).toEqual([]);
    expect(parseVaultListPayload(null)).toEqual([]);
    expect(isVaultListPayload({ detail: "unauthorized" })).toBe(false);
    expect(isVaultListPayload([{ id: "ks_1" }])).toBe(true);
  });
});

describe("shouldRefreshVaultOnVisit", () => {
  it("refetches when the user returns to Vault or Home", () => {
    expect(shouldRefreshVaultOnVisit("vault")).toBe(true);
    expect(shouldRefreshVaultOnVisit("home")).toBe(true);
    expect(shouldRefreshVaultOnVisit("docs")).toBe(false);
  });
});

describe("passkey is not required to save", () => {
  it("only gates paste / reveal / unlock — never detect, save, or call", () => {
    expect(needsPasskey("save")).toBe(false);
    expect(needsPasskey("detect")).toBe(false);
    expect(needsPasskey("call")).toBe(false);
    expect(needsPasskey("paste")).toBe(true);
    expect(needsPasskey("reveal")).toBe(true);
    expect(needsPasskey("unlock")).toBe(true);
  });

  it("classifies Helius dashboard UUIDs so store does not 422", () => {
    expect(detectUpstream("10470584-67a9-4abc-8def-123456787761").upstream).toBe("helius");
  });

  it("extracts all five Helius UUIDs from one paste so Save writes five rows", () => {
    const blob = [
      "10470584-67a9-4abc-8def-123456787761",
      "210e4c2a-91b0-4c3d-a111-aaaaaaaaaaa1",
      "310e4c2a-91b0-4c3d-a222-bbbbbbbbbbb2",
      "410e4c2a-91b0-4c3d-a333-ccccccccccc3",
      "510e4c2a-91b0-4c3d-a444-ddddddddddd4",
    ].join("\n");
    const hits = extractDetectedKeys(blob);
    expect(hits).toHaveLength(5);
    expect(hits.every((hit) => hit.upstream === "helius")).toBe(true);
  });

  it("Vault / Home save and addItem do not prompt passkey", () => {
    const vault = readFileSync(resolve(root, "src/web/components/sections/VaultSection.tsx"), "utf8");
    const home = readFileSync(resolve(root, "src/web/components/sections/HomeSection.tsx"), "utf8");
    const hook = readFileSync(resolve(root, "src/web/hooks/useVaults.ts"), "utf8");
    expect(vault).toContain("storeDetectedKey");
    expect(vault).not.toContain("ensureVerified");
    expect(home).toContain("storeDetectedKey");
    expect(home).not.toContain("ensureVerified");
    expect(home).not.toContain("Verifying with passkey");
    expect(hook).toContain("Detect + save never prompts passkey");
    expect(hook).not.toMatch(/await unlock\(\)/);
  });
});

describe("Vault page saved-key hero", () => {
  it("lists /manage/vault rows after sign-in the same way the popup does", () => {
    const src = readFileSync(resolve(root, "src/web/components/sections/VaultSection.tsx"), "utf8");
    expect(src).toContain('data-testid="vault-saved-apis"');
    expect(src).toContain("1 saved");
    expect(src).toContain("item.value");
    expect(src).toContain("item.name");
    expect(src).toContain("/manage/vault");
    expect(src).toContain("storeDetectedKeys");
    expect(src).toContain("extractDetectedKeys");
  });
});

describe("pending vault preview", () => {
  it("turns queued detect hits into Vault rows and Cursor fill keys", () => {
    const hits = [
      { upstream: "helius", value: "10470584-67a9-4abc-8def-123456787761" },
      { upstream: "openai", value: "sk-proj-LOCALONLYFILLTEST123456" },
      { upstream: "helius", value: "10470584-67a9-4abc-8def-123456787761" },
    ];
    const rows = previewPendingVaultHits(hits);
    expect(rows).toHaveLength(2);
    expect(rows[0].upstream).toBe("helius");
    expect(rows[0].masked_value).toBe(maskVaultPreview(hits[0].value));
    expect(JSON.stringify(rows)).not.toContain("123456787761");
    const merged = mergeVaultRows([], rows);
    expect(merged).toHaveLength(2);
    const fill = pendingHitsToFillKeys(hits, ["openai", "anthropic"]);
    expect(fill).toEqual([
      { id: "pending-openai", upstream: "openai", name: "openai key", value: "sk-proj-LOCALONLYFILLTEST123456" },
    ]);
    const hook = readFileSync(resolve(root, "src/web/hooks/useVaults.ts"), "utf8");
    expect(hook).toContain("previewPendingVaultHits");
    expect(hook).toContain("__ks_pending_vault");
    const bg = readFileSync(resolve(root, "src/extension/background.js"), "utf8");
    expect(bg).toContain("function pendingKeysForUpstreams");
    expect(bg).toContain("ks_pending_vault");
  });
});

describe("flushPendingVaultHits", () => {
  it("is the dashboard write path for extension-queued keys", () => {
    expect(flushPendingVaultHits).toBeTypeOf("function");
    const hook = readFileSync(resolve(root, "src/web/App.tsx"), "utf8");
    expect(hook).toContain("flushPendingVaultHits");
    expect(hook).toContain("__ks_pending_vault");
    const bridge = readFileSync(resolve(root, "src/extension/session-bridge.js"), "utf8");
    expect(bridge).toContain("__ks_pending_vault");
    const bg = readFileSync(resolve(root, "src/extension/background.js"), "utf8");
    expect(bg).toContain("queuePendingVault");
    expect(bg).toContain("ks_pending_vault");
    expect(bg).toContain("pendingApis");
  });
});

describe("leftover harvest still queues when HTTP store fails", () => {
  it("does not bail before writing ks_pending_vault", () => {
    const leftover = readFileSync(resolve(root, "src/extension/patch-leftover-bridge.py"), "utf8");
    expect(leftover).not.toContain("if(!token)return{saved:0}");
    expect(leftover).toContain("leftoverQueuePending");
    expect(leftover).toContain("leftoverFillCursorTabs");
    expect(leftover).toContain("sk-(?:proj-|svcacct-|admin-)?");
    expect(leftover).toContain("ks_pending_vault");
  });
});

describe("isLocalApiBase", () => {
  it("allows X-Dev-Mode only on loopback", () => {
    expect(isLocalApiBase("http://127.0.0.1:8001")).toBe(true);
    expect(isLocalApiBase("https://keyshield-production.up.railway.app")).toBe(false);
  });
});
