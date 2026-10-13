import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readApiErrorMessage } from "../src/web/lib/passkey-id";

describe("registered password opens the app", () => {
  it("AuthScreen login page has no User ID / password / Open app form", () => {
    const src = readFileSync("src/web/components/AuthScreen.tsx", "utf8");
    expect(src).not.toContain("passwordLogin");
    expect(src).not.toContain('data-testid="password-login"');
    expect(src).not.toContain('data-testid="password-userid"');
    expect(src).not.toContain('data-testid="password-secret"');
    expect(src).not.toContain('data-testid="password-open"');
    expect(src).not.toContain("Registered password");
    expect(src).not.toContain("Open app");
    expect(src).not.toContain("User ID");
    expect(src).toContain('data-testid="passkey-signin"');
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
