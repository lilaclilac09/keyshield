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
    expect(src).toContain('or use email + KeyShield password');
    expect(src).toContain('KeyShield password (not your Google password)');
    expect(src).toContain('htmlFor="keyshield-password"');
    expect(src).not.toContain('or use Gmail + password');
    expect(src).toContain("you@gmail.com");
    expect(src).toContain("not a Solana-only");
    expect(src).toContain("A wallet is optional");
    expect(src).toContain('data-testid="optional-wallet"');
    expect(src).toContain('data-testid="passkey-signin"');
    expect(src).toContain('data-testid="auth-card"');
    expect(src).toContain('data-testid="passkey-signup"');
    expect(src).toContain("<WalletConnector");
    expect(src).toContain("forgetDevice");
    expect(src).toContain("Sign in with Google");
    expect(src).not.toContain("Sign in with Google email");
    expect(src).not.toContain("Live Google OAuth is not configured");
    expect(src).toContain("googleStatus?.enabled !== false");
    expect(src).toContain("isGoogleNotConfigured");
    expect(src).toContain("Create account");
    expect(src).toContain("setAuthMethod");
    expect(src).toContain("seedPasskey");
    expect(src).toContain("method: 'password'");
  });

  it("describes explicit key selection and pasting, not background discovery", () => {
    const hint = readFileSync('src/web/components/ExtensionInstallHint.tsx', 'utf8');
    const vault = readFileSync('src/web/components/sections/VaultSection.tsx', 'utf8');
    expect(hint).toContain('saves a key only when you select it or enter it manually');
    expect(vault).toContain('Provider from your paste:');
    expect(vault).toContain('Paste a key to recognize its provider');
    expect(hint + vault).not.toMatch(/auto-detect/i);
  });

  it('uses the current extension passphrase flow on sign-in, Home and Docs without token handoff instructions', () => {
    const hint = readFileSync('src/web/components/ExtensionInstallHint.tsx', 'utf8');
    const home = readFileSync('src/web/components/sections/HomeSection.tsx', 'utf8');
    const docs = readFileSync('src/web/components/sections/DocsSection.tsx', 'utf8');
    const popup = readFileSync('src/extension/popup.html', 'utf8');
    const worker = readFileSync('src/extension/background.js', 'utf8');
    const vault = readFileSync('src/extension/lib/vault.js', 'utf8');
    expect(popup).toContain('Create / unlock vault');
    expect(popup).toContain('Vault passphrase (12+ characters)');
    expect(worker).toContain('new LocalVault(chrome.storage.local)');
    expect(vault).toContain("crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2'");
    expect(hint).toContain('at least 12 characters');
    expect(hint).toContain('No dashboard account, session token or sync is needed.');
    expect(hint).toContain('Nothing is filled automatically.');
    expect(home).toContain('ExtensionInstallHint variant="home"');
    expect(docs).toContain('ExtensionInstallHint variant="home"');
    expect(hint + home + docs).not.toMatch(/Copy token for extension|popup gets a session token|already logged in when a token|ExtensionTokenCopy|ok 1\.2\.5|manifest\.muse\.json/);
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
