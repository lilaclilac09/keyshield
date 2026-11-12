import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isDesktopShell } from "../src/web/lib/desktop-shell";

const root = resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const preflight = require("../src/desktop/runtime-preflight.cjs") as {
  inspectMacBundle: (root: string) => {
    ok: boolean;
    missing: string[];
    warnings: string[];
    helpers: string[];
  };
  verifyMacBundleRuntime: (appPath: string) => { ok: boolean };
};

function read(rel: string): string {
  return require("node:fs").readFileSync(resolve(root, rel), "utf8");
}

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ks-mac-bundle-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/** Electron 33 + electron-packager darwin layout (no Resources/icudtl.dat, no helper Frameworks). */
function makeElectron33Fixture(dir: string, opts?: { renderer?: boolean; icu?: boolean }): string {
  const app = join(dir, "KeyShield.app");
  const contents = join(app, "Contents");
  const frameworks = join(contents, "Frameworks");
  const resources = join(contents, "Resources");
  mkdirSync(join(contents, "MacOS"), { recursive: true });
  writeFileSync(join(contents, "MacOS", "KeyShield"), "bin");
  chmodSync(join(contents, "MacOS", "KeyShield"), 0o755);

  const versionA = join(frameworks, "Electron Framework.framework", "Versions", "A");
  mkdirSync(join(versionA, "Resources"), { recursive: true });
  if (opts?.icu !== false) {
    writeFileSync(join(versionA, "Resources", "icudtl.dat"), "icu");
  }
  writeFileSync(join(versionA, "Electron Framework"), "fw");
  symlinkSync("A", join(frameworks, "Electron Framework.framework", "Versions", "Current"));
  symlinkSync(
    "Versions/Current/Resources",
    join(frameworks, "Electron Framework.framework", "Resources"),
  );
  symlinkSync(
    "Versions/Current/Electron Framework",
    join(frameworks, "Electron Framework.framework", "Electron Framework"),
  );

  for (const helper of [
    "KeyShield Helper.app",
    "KeyShield Helper (GPU).app",
    "KeyShield Helper (Renderer).app",
    "KeyShield Helper (Plugin).app",
  ]) {
    const mac = join(frameworks, helper, "Contents", "MacOS");
    mkdirSync(mac, { recursive: true });
    const bin = helper.replace(/\.app$/, "");
    writeFileSync(join(mac, bin), "helper");
    chmodSync(join(mac, bin), 0o755);
  }

  mkdirSync(join(resources, "renderer"), { recursive: true });
  if (opts?.renderer !== false) {
    writeFileSync(join(resources, "renderer", "index.html"), "<html>KeyShield</html>");
  }
  return app;
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
    expect(main).toContain("packagedRuntimePreflight");
    expect(main).toContain("inspectMacBundle");
    expect(main).not.toContain("vault-only");
    expect(main).not.toContain("protocol.registerSchemesAsPrivileged");
  });

  it("shows the window before Touch ID and does not quit on preflight warnings", () => {
    const main = read("src/desktop/main.cjs");
    expect(main).toContain("show: true");
    expect(main).toContain("const win = await createWindow();");
    expect(main).toContain("void maybeTouchId();");
    expect(main.indexOf("const win = await createWindow();")).toBeLessThan(
      main.indexOf("void maybeTouchId();"),
    );
    expect(main).not.toContain("const unlock = await maybeTouchId();");
    expect(main).toContain("bringWindowToForeground(win);");
    expect(main).toContain("loadDashboard");
    expect(main).toContain("boot.html");
    expect(main).not.toMatch(/blockStartup\(preflight\);\s*app\.quit\(\)/);
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

  it("restores or recreates the desktop window on second-instance activate", () => {
    const main = read("src/desktop/main.cjs");
    expect(main).toContain("app.on('second-instance'");
    expect(main).toContain("if (win) {");
    expect(main).toContain("void createWindow().then((created) => {");
    expect(main).toContain("KeyShield window restored");
    expect(main).toContain("Unable to restore window");
    expect(main).toContain("bringWindowToForeground(existing)");
  });

  it("packed renderer talks to the hosted control plane by default", () => {
    const build = read("src/desktop/scripts/build-renderer.cjs");
    expect(build).toContain("https://keyshield-production.up.railway.app");
    expect(build).toContain("build:vite");
  });

  it("pack script preserves helper symlinks, uses Electron 33 checks, and ships Open-KeyShield.command", () => {
    const pack = read("src/desktop/scripts/pack-mac.cjs");
    expect(pack).toContain("stageAppBundle");
    expect(pack).toContain("verbatimSymlinks: true");
    expect(pack).toContain("verifyMacBundleRuntime");
    expect(pack).toContain("runtime-preflight.cjs");
    expect(pack).toContain("Open-KeyShield.command");
    expect(pack).toContain("OPEN-ME.txt");
    expect(pack).toContain("skip dmg on");
    expect(pack).not.toContain("Helper.app/Contents/Frameworks/Electron Framework.framework/Resources/icudtl.dat");
    expect(pack).toContain("boot.html");
  });

  it("accepts a real Electron 33 bundle that PR #137 preflight rejected", () => {
    const app = makeElectron33Fixture(tempDir());
    const report = preflight.inspectMacBundle(app);
    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.helpers).toHaveLength(4);
    expect(preflight.inspectMacBundle(join(app, "Contents")).ok).toBe(true);
    expect(() => preflight.verifyMacBundleRuntime(app)).not.toThrow();

    const oldRequired = [
      join(app, "Contents", "Resources", "icudtl.dat"),
      join(
        app,
        "Contents",
        "Frameworks",
        "KeyShield Helper.app",
        "Contents",
        "Frameworks",
        "Electron Framework.framework",
        "Resources",
        "icudtl.dat",
      ),
    ];
    expect(oldRequired.every((file) => !existsSync(file))).toBe(true);
  });

  it("fails pack/runtime checks only when the Electron framework ICU is actually missing", () => {
    const app = makeElectron33Fixture(tempDir(), { icu: false });
    const report = preflight.inspectMacBundle(app);
    expect(report.ok).toBe(false);
    expect(report.missing.some((file) => file.endsWith("icudtl.dat"))).toBe(true);
    expect(() => preflight.verifyMacBundleRuntime(app)).toThrow(/icudtl\.dat/);
  });

  it("warns when the packed renderer is missing instead of treating helper ICU as fatal", () => {
    const app = makeElectron33Fixture(tempDir(), { renderer: false });
    const report = preflight.inspectMacBundle(app);
    expect(report.ok).toBe(true);
    expect(report.warnings.some((file) => file.endsWith("index.html"))).toBe(true);
  });

  it("desktop login keeps email signup in front and session-token fallback", () => {
    const auth = read("src/web/components/AuthScreen.tsx");
    expect(auth).toContain("isDesktopShell");
    expect(auth).toContain('data-testid="desktop-session-token"');
    expect(auth).toContain("passwordLogin");
    expect(auth).toMatch(/type="password"/);
    expect(auth).toContain("focusLoginWindow");
    expect(auth).toContain("Sign in with Google email");
    expect(read("src/web/lib/desktop-shell.ts")).toMatch(/Electron/i);
    expect(read("src/web/lib/desktop-shell.ts")).toContain("focusLoginWindow");
    expect(read("src/desktop/preload.cjs")).toContain("focusMainWindow");
    expect(read("src/desktop/preload.cjs")).toContain("writeText");
    expect(read("src/desktop/main.cjs")).toContain("ks-focus-main");
    expect(read("src/desktop/main.cjs")).toContain("ks-clipboard-write");
    expect(read("src/web/lib/app-feedback.ts")).toContain("writeText");
    expect(read("src/web/components/sections/HomeSection.tsx")).toContain("ExtensionTokenCopy");
  });

  it("treats Electron userAgent as a desktop shell when preload is missing", () => {
    const prevWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const prevNav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "window", {
      value: { keyshieldDesktop: undefined },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, "navigator", {
      value: { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Electron/33.4.11" },
      configurable: true,
    });
    try {
      expect(isDesktopShell()).toBe(true);
    } finally {
      if (prevWindow) Object.defineProperty(globalThis, "window", prevWindow);
      else delete (globalThis as { window?: unknown }).window;
      if (prevNav) Object.defineProperty(globalThis, "navigator", prevNav);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
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
    expect(read("src/web/lib/human-usable.ts")).toContain("humanActionError");
    expect(read("src/web/components/AuthScreen.tsx")).toContain("passkey-next-step");
    expect(read("src/web/components/WalletConnector.tsx")).toContain("Next step:");
    expect(read("src/web/components/sections/VaultSection.tsx")).toContain("humanActionError");
    const main = read("src/desktop/main.cjs");
    expect(main).toContain("ks-feedback");
    expect(main).toContain("did-fail-load");
    expect(read("src/desktop/preload.cjs")).toContain("notify:");
  });

  it("documents measurable human-usable acceptance criteria", () => {
    const standard = read("docs/technical/human-usable-ui-standards.md");
    expect(standard).toContain("Waiting states are explicit");
    expect(standard).toContain("Completion feedback is deterministic and readable");
    expect(standard).toContain("No silent no-op after user intent");
    expect(standard).toContain("Next step:");
    const docsSection = read("src/web/components/sections/DocsSection.tsx");
    expect(docsSection).toContain("human-usable-ui-standards.md");
  });

  it("ships an Open-KeyShield.command that clears quarantine and opens /Applications", () => {
    const cmd = read("src/desktop/Open-KeyShield.command");
    expect(cmd).toContain("xattr -cr");
    expect(cmd).toContain("/Applications/KeyShield.app");
    expect(cmd).toContain("codesign --sign - --force --deep");
    expect(cmd).toContain("open \"$DEST\"");
    expect(read("src/desktop/OPEN-ME.txt")).toContain("Open-KeyShield.command");
    expect(read("src/desktop/boot.html")).toContain("Open login");
  });
});
