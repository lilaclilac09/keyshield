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
import { detectUpstream } from "../src/web/lib/keychain";

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
  });
});

describe("isLocalApiBase", () => {
  it("allows X-Dev-Mode only on loopback", () => {
    expect(isLocalApiBase("http://127.0.0.1:8001")).toBe(true);
    expect(isLocalApiBase("https://keyshield-production.up.railway.app")).toBe(false);
  });
});
