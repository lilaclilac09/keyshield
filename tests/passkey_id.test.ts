import { describe, expect, it } from "vitest";
import {
  readPasskeyUserIdFromStorage,
  resolvePasskeyUserId,
  shortPasskeyLabel,
  shouldShowPasskeyPanel,
} from "../src/web/lib/passkey-id";

describe("resolvePasskeyUserId", () => {
  it("prefers the preregistered passkey id", () => {
    expect(resolvePasskeyUserId({
      passkeyUser: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      wallet: "other",
    })).toBe("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
  });

  it("falls back to the wallet address after a tab jump", () => {
    expect(resolvePasskeyUserId({ passkeyUser: "", wallet: "Abcdefghijkl" })).toBe("Abcdefghijkl");
  });

  it("is empty when nothing is registered", () => {
    expect(resolvePasskeyUserId({ passkeyUser: "  ", wallet: null })).toBeNull();
  });
});

describe("shouldShowPasskeyPanel", () => {
  it("shows Sign in as id when a preregistered id exists", () => {
    expect(shouldShowPasskeyPanel({ userId: "abcd1234efgh", preferWallet: false })).toBe(true);
    expect(shortPasskeyLabel("abcd1234efgh")).toBe("abcd\u2026efgh");
  });

  it("hides the panel only while the user asked for a different wallet", () => {
    expect(shouldShowPasskeyPanel({ userId: "abcd1234efgh", preferWallet: true })).toBe(false);
  });

  it("reads from storage the same way AuthScreen does after jump-out", () => {
    const store = {
      data: { ks_passkey_user: "wallet111", ks_wallet: "wallet111" } as Record<string, string>,
      getItem(key: string) { return this.data[key] ?? null; },
    };
    expect(readPasskeyUserIdFromStorage(store)).toBe("wallet111");
  });
});
