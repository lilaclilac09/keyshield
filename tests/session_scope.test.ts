import { describe, expect, it } from "vitest";
import {
  authMethodLabel,
  isEmailAccountId,
  passkeyIdentityFrom,
  readTokenScope,
} from "../src/web/lib/session-scope";
import { resolvePasskeyUserId, shouldShowPasskeyPanel } from "../src/web/lib/passkey-id";

function tokenWithScope(scope: string): string {
  const payload = btoa(JSON.stringify({ uid: "aileen@gmail.com", scp: scope, exp: 9e12 }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${payload}.sig`;
}

describe("email vs passkey identity after Gmail signup", () => {
  it("does not treat a Gmail address as a Face ID id", () => {
    expect(isEmailAccountId("aileen@gmail.com")).toBe(true);
    expect(passkeyIdentityFrom("aileen@gmail.com")).toBeNull();
    expect(resolvePasskeyUserId({
      passkeyUser: "aileen@gmail.com",
      wallet: "aileen@gmail.com",
    })).toBeNull();
    expect(shouldShowPasskeyPanel({ userId: "aileen@gmail.com", preferWallet: false })).toBe(false);
  });

  it("still resolves a Solana wallet as the Face ID id", () => {
    const wallet = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
    expect(resolvePasskeyUserId({ passkeyUser: "", wallet })).toBe(wallet);
    expect(shouldShowPasskeyPanel({ userId: wallet, preferWallet: false })).toBe(true);
  });
});

describe("session scope from token", () => {
  it("reads proxy vs owner from the payload", () => {
    expect(readTokenScope(tokenWithScope("proxy"))).toBe("proxy");
    expect(readTokenScope(tokenWithScope("owner"))).toBe("owner");
    expect(readTokenScope("not-a-token")).toBe("owner");
  });

  it("labels Gmail accounts as email, not Solana-only", () => {
    expect(authMethodLabel("password", "aileen@gmail.com")).toContain("Google email");
    expect(authMethodLabel("agent", "abc")).toContain("proxy");
  });
});
