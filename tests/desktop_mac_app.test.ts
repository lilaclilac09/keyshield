import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("KeyShield Mac app is a 1:1 wrap of src/web", () => {
  it("keeps every live dashboard section in App.tsx", () => {
    const app = read("src/web/App.tsx");
    for (const id of [
      "home",
      "vault",
      "activity",
      "developer",
      "docs",
      "agents",
      "sharing",
      "sessions",
      "settings",
      "reports",
      "trust",
    ]) {
      expect(app).toContain(`id: '${id}'`);
    }
    expect(app).toContain("HomeSection");
    expect(app).toContain("VaultSection");
    expect(app).toContain("ActivitySection");
    expect(app).toContain("DeveloperSection");
    expect(app).toContain("DocsSection");
    expect(app).toContain("AgentsSection");
    expect(app).toContain("EphemeralWalletsSection");
    expect(app).toContain("SharingSection");
    expect(app).toContain("SessionsSection");
    expect(app).toContain("SettingsSection");
    expect(app).toContain("ReportPage");
    expect(app).toContain("X402TrustManager");
    expect(app).toContain("StoryJourney");
    expect(app).not.toContain("Coming soon");
    expect(app).not.toContain("stub page");
  });

  it("desktop shell loads the live origin and the bundled renderer", () => {
    const main = read("src/desktop/main.cjs");
    expect(main).toContain("app.ks.aileena.xyz");
    expect(main).toContain("renderer");
    expect(main).toContain("KS_DESKTOP_LIVE");
    expect(main).toContain("promptTouchID");
    expect(main).toContain("persist:keyshield");
    expect(main).not.toContain("vault-only");
  });

  it("waits for Touch ID and then foregrounds the app window", () => {
    const main = read("src/desktop/main.cjs");
    expect(main).toContain("const unlock = await maybeTouchId();");
    expect(main).toContain("const win = await createWindow();");
    expect(main).toContain("if (unlock?.ok) bringWindowToForeground(win);");
    expect(main).toContain("await systemPreferences.promptTouchID");
    expect(main).toContain("bringWindowToForeground(BrowserWindow.getAllWindows()[0]);");
    expect(main).toContain("flushPendingShellFeedback(win);");
  });

  it("keeps unlock feedback visible long enough to read", () => {
    const main = read("src/desktop/main.cjs");
    expect(main).toContain("function feedbackVisibilityMs(kind)");
    expect(main).toContain("if (kind === 'success') return 6500;");
    expect(main).toContain("if (kind === 'error') return 9000;");
    expect(main).toContain("if (kind === 'busy') return 12000;");
    expect(main).toContain("pendingShellFeedback");
  });

  it("packed renderer talks to the hosted control plane by default", () => {
    const build = read("src/desktop/scripts/build-renderer.cjs");
    expect(build).toContain("https://keyshield-production.up.railway.app");
    expect(build).toContain("build:vite");
  });

  it("desktop login fallback is gated and is not password login", () => {
    const auth = read("src/web/components/AuthScreen.tsx");
    expect(auth).toContain("isDesktopShell");
    expect(auth).toContain('data-testid="desktop-session-token"');
    expect(auth).not.toContain("passwordLogin");
    expect(auth).not.toMatch(/type="password"/);
  });

  it("does not rebuild Python proxy, MPP, or billing in the shell", () => {
    const main = read("src/desktop/main.cjs");
    expect(main).not.toContain("uvicorn");
    expect(main).not.toContain("ks-proxy");
    expect(main).not.toContain("mpp_streams");
  });

  it("shows unlock save copy proxy MPP error and success feedback", () => {
    const app = read("src/web/App.tsx");
    expect(app).toContain("AppFeedbackToast");
    expect(app).toContain("copyWithFeedback");
    const feedback = read("src/web/lib/app-feedback.ts");
    expect(feedback).toContain("emitAppFeedback");
    expect(feedback).toContain("copyWithFeedback");
    expect(read("src/web/components/ui/AppFeedbackToast.tsx")).toContain('data-testid="app-feedback-toast"');
    expect(read("src/web/components/AuthScreen.tsx")).toContain("Unlocking with passkey");
    expect(read("src/web/hooks/useVaults.ts")).toContain("Vault unlocked");
    expect(read("src/web/components/sections/VaultSection.tsx")).toContain("Saved to vault");
    expect(read("src/web/components/ui/CopyButton.tsx")).toContain("copyWithFeedback");
    expect(read("src/web/components/sections/HomeSection.tsx")).toContain("source: 'proxy'");
    expect(read("src/web/components/PaymentsLedger.tsx")).toContain("source: 'mpp'");
    expect(read("src/web/components/HealthBadge.tsx")).toContain("API offline");
    const main = read("src/desktop/main.cjs");
    expect(main).toContain("ks-feedback");
    expect(main).toContain("did-fail-load");
    expect(read("src/desktop/preload.cjs")).toContain("notify:");
  });
});
