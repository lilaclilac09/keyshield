import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readApiErrorMessage } from "../src/web/lib/passkey-id";

describe("password sign-in UI removed; helper kept", () => {
  it("AuthScreen no longer shows the user ID + password sign-in", () => {
    const src = readFileSync("src/web/components/AuthScreen.tsx", "utf8");
    expect(src).not.toContain("passwordLogin");
    expect(src).not.toContain('data-testid="password-login"');
    expect(src).not.toContain("registered password");
    expect(src).toContain('data-testid="passkey-signin"');
    expect(src).toContain("Use a different wallet instead");
    expect(src).toContain("forgetDevice");
  });

  it("client login helper posts /auth/login", () => {
    const src = readFileSync("src/web/lib/auth.ts", "utf8");
    expect(src).toContain("export async function passwordLogin");
    expect(src).toContain("${API_BASE}/auth/login");
    expect(src).toContain("userId: id, password");
  });

  it("surfaces Python error/detail the same way Face ID does", () => {
    expect(readApiErrorMessage({ error: "invalid credentials" }, "Password login failed")).toBe(
      "invalid credentials",
    );
  });
});
