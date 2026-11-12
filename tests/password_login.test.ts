import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readApiErrorMessage } from "../src/web/lib/passkey-id";

describe("email + password sign-in on AuthScreen", () => {
  it("AuthScreen shows Google email signup, not wallet-only copy", () => {
    const src = readFileSync("src/web/components/AuthScreen.tsx", "utf8");
    expect(src).toContain("passwordLogin");
    expect(src).toContain("passwordSignup");
    expect(src).toContain('data-testid="password-login"');
    expect(src).toContain('data-testid="google-email-signin"');
    expect(src).toContain('data-testid="email-signup"');
    expect(src).toContain('data-testid="email-signin"');
    expect(src).toContain('type="password"');
    expect(src).toContain("you@gmail.com");
    expect(src).toContain("not a Solana-only");
    expect(src).toContain("A wallet is optional");
    expect(src).toContain('data-testid="optional-wallet"');
    expect(src).toContain('data-testid="passkey-signin"');
    expect(src).toContain('data-testid="auth-card"');
    expect(src).toContain('data-testid="passkey-signup"');
    expect(src).toContain("<WalletConnector");
    expect(src).toContain("forgetDevice");
    expect(src).toContain("Sign in with Google email");
    expect(src).toContain("Create account");
    expect(src).toContain("setAuthMethod");
    expect(src).toContain("seedPasskey");
    expect(src).toContain("method: 'password'");
  });

  it("documents Google OAuth env vars without requiring them to boot", () => {
    const env = readFileSync(".env.example", "utf8");
    expect(env).toContain("GOOGLE_CLIENT_ID=");
    expect(env).toContain("GOOGLE_CLIENT_SECRET=");
    expect(env).toContain("GOOGLE_REDIRECT_URI=");
    expect(env).toContain("KS_GOOGLE_SUCCESS_URL=");
    expect(env).toContain("KS_GOOGLE_CLIENT_ID");
    const google = readFileSync("src/backend/auth/google_oauth.py", "utf8");
    expect(google).toContain("GOOGLE_CLIENT_ID");
    expect(google).toContain("KS_GOOGLE_CLIENT_SECRET");
  });

  it("client login helper posts /auth/login and signup posts /auth/signup", () => {
    const src = readFileSync("src/web/lib/auth.ts", "utf8");
    expect(src).toContain("export async function passwordLogin");
    expect(src).toContain("export async function passwordSignup");
    expect(src).toContain("${API_BASE}/auth/login");
    expect(src).toContain("${API_BASE}/auth/signup");
    expect(src).toContain("email: id.toLowerCase()");
  });

  it("surfaces Python error/detail the same way Face ID does", () => {
    expect(readApiErrorMessage({ error: "invalid credentials" }, "Password login failed")).toBe(
      "invalid credentials",
    );
  });
});
