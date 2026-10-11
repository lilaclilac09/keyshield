import { describe, expect, it } from "vitest";
import {
  isLocalApiBase,
  isVaultListPayload,
  parseVaultListPayload,
  shouldRefreshVaultOnVisit,
} from "../src/web/lib/vault-list";

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

describe("isLocalApiBase", () => {
  it("allows X-Dev-Mode only on loopback", () => {
    expect(isLocalApiBase("http://127.0.0.1:8001")).toBe(true);
    expect(isLocalApiBase("https://keyshield-production.up.railway.app")).toBe(false);
  });
});
