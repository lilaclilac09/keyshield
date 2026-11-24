import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PROD_API_BASE as DESKTOP_API_BASE, isLegacyBakedUrl as isDesktopLegacyUrl } from "../src/desktop/host-deploy";
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
    expect(read("src/desktop/startup-policy.cjs")).toContain("promptTouchID");
    expect(main).toContain("persist:keyshield");
    expect(main).toContain("packagedRuntimePreflight");
    expect(main).toContain("inspectMacBundle");
    expect(main).toContain("renderer-server.cjs");
    expect(main).toContain("showDiagnosticsScreen");
    expect(main).toContain("probeMounted");
    expect(main).toContain("render-process-gone");
    expect(main).toContain("ks-reveal-log");
    expect(read("src/desktop/preload.cjs")).toContain("revealLog");
    expect(read("src/desktop/preload.cjs")).toContain("getDiagnostics");
    expect(main).not.toContain("vault-only");
    expect(main).not.toContain("protocol.registerSchemesAsPrivileged");
  });

  it("shows the window without unsolicited Touch ID and keeps a local preflight error window", () => {
    const main = read("src/desktop/main.cjs");
    expect(main).toContain("show: true");
    expect(main).toContain("const win = await createWindow();");
    expect(main).not.toContain("void maybeTouchId();");
    expect(main).not.toContain("const unlock = await maybeTouchId();");
    expect(main).toContain("bringWindowToForeground(win);");
    expect(main).toContain("loadDashboard");
    expect(main).toContain("boot.html");
    expect(main).not.toMatch(/blockStartup\(preflight\);\s*app\.quit\(\)/);
    expect(main).toContain("await authorizeTouchId");
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
    expect(build).toContain("https://api.ks.aileena.xyz");
    const { env } = require("../src/desktop/scripts/build-renderer.cjs");
    expect(env.KEYSHIELD_API_URL).toBe("https://api.ks.aileena.xyz");
    expect(env.KEYSHIELD_PUBLIC_API_BASE).toBe("https://api.ks.aileena.xyz");
    expect(DESKTOP_API_BASE).toBe("https://api.ks.aileena.xyz");
    expect(isDesktopLegacyUrl(DESKTOP_API_BASE)).toBe(false);
    for (const file of ["src/desktop/main.cjs", "src/desktop/scripts/build-renderer.cjs", "src/desktop/host-deploy.ts"]) {
      expect(read(file), file).not.toContain("keyshield-production.up.railway.app");
    }
    expect(read("src/desktop/main.cjs")).toContain("const PROD_API = 'https://api.ks.aileena.xyz'");
    expect(build).toContain("build:vite");
    expect(build).toContain("verifyRendererDist");
    expect(build).toContain("assets");
  });

  it("pack script preserves runtime symlinks and ships only plain install notes", () => {
    const pack = read("src/desktop/scripts/pack-mac.cjs");
    expect(pack).toContain("stageAppBundle");
    expect(pack).toContain("verbatimSymlinks: true");
    expect(pack).toContain("verifyMacBundleRuntime");
    expect(pack).toContain("runtime-preflight.cjs");
    expect(pack).not.toContain("Open-KeyShield.command");
    expect(pack).toContain("OPEN-ME.txt");
    expect(pack).toContain("skip dmg on");
    expect(pack).not.toContain("Helper.app/Contents/Frameworks/Electron Framework.framework/Resources/icudtl.dat");
    expect(pack).toContain("boot.html");
    expect(pack).toContain("BUILD-INFO");
    expect(pack).toContain("ditto");
    expect(pack).toContain("verifyRendererDist");
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
    expect(auth).toContain("Sign in with Google");
    expect(auth).not.toContain("Sign in with Google email");
    expect(auth).not.toContain("Live Google OAuth is not configured");
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

  it("excludes a resolved custom release directory and its staged artifacts, not similarly named siblings", () => {
    const { createPackagerIgnore } = require("../src/desktop/scripts/pack-mac.cjs");
    const ignore = createPackagerIgnore(resolve(root, "src/desktop/builds/../builds/tester"));
    for (const file of ["/builds/tester", "/builds/tester/KeyShield.dmg", "/builds/tester/KeyShield.zip", "/builds/tester/dmg-root/KeyShield.app/Contents/Info.plist", "/out/app", "/release/old.dmg"]) {
      expect(ignore(file), file).toBe(true);
    }
    for (const file of ["", "/main.cjs", "/package.json", "/builds/tester-not-output/config.json", "/builds/other/config.json"]) {
      expect(ignore(file), file).toBe(false);
    }
    expect(read("src/desktop/scripts/pack-mac.cjs")).toContain("ignore: createPackagerIgnore()");
  });

  it("keeps source files when the release directory is outside the desktop source tree", () => {
    const { createPackagerIgnore } = require("../src/desktop/scripts/pack-mac.cjs");
    const ignore = createPackagerIgnore(resolve(root, "src/desktop-other/releases"));
    expect(ignore("")).toBe(false);
    expect(ignore("/main.cjs")).toBe(false);
    expect(ignore("/release/KeyShield.dmg")).toBe(true);
  });

  it("rejects the desktop source root as the release directory", () => {
    const { createPackagerIgnore } = require("../src/desktop/scripts/pack-mac.cjs");
    expect(() => createPackagerIgnore(resolve(root, "src/desktop"))).toThrow("Release directory must not be the desktop source root");
  });

  it.each([undefined, "", "  ", "-"])("defaults to offline ad-hoc sealing without Team ID library validation: %s", (identity) => {
    const { macSigningOptions } = require("../src/desktop/scripts/pack-mac.cjs");
    const options = macSigningOptions(identity ?? "");
    expect(options.identity).toBe("-");
    expect(options.identityValidation).toBe(false);
    expect(options.preAutoEntitlements).toBe(false);
    expect(options.preEmbedProvisioningProfile).toBe(false);
    expect(options.strictVerify).toBe(true);
    expect(options.optionsForFile("KeyShield Helper.app")).toEqual({ hardenedRuntime: false, timestamp: "none" });
    expect(read("src/desktop/scripts/pack-mac.cjs")).toContain("osxSign: macSigningOptions()");
  });

  it("provides a validated identity hook without overriding Electron's per-role entitlements", () => {
    const { macSigningOptions } = require("../src/desktop/scripts/pack-mac.cjs");
    const options = macSigningOptions("Developer ID Application: Synthetic Identity");
    expect(options.identityValidation).toBe(true);
    expect(options.preAutoEntitlements).toBe(true);
    expect(options.optionsForFile("KeyShield.app")).toEqual({ hardenedRuntime: true, timestamp: undefined });
    expect(options.optionsForFile("KeyShield.app")).not.toHaveProperty("entitlements");
  });

  it("requires strict verification and propagates broken-seal errors", () => {
    const { verifyMacSeal } = require("../src/desktop/scripts/pack-mac.cjs");
    const calls: unknown[][] = [];
    verifyMacSeal("/synthetic/KeyShield.app", (...args: unknown[]) => calls.push(args));
    expect(calls).toEqual([["codesign", ["--verify", "--deep", "--strict", "/synthetic/KeyShield.app"], { stdio: "inherit" }]]);
    expect(() => verifyMacSeal("/synthetic/KeyShield.app", () => { throw new Error("broken seal"); })).toThrow("broken seal");
  });

  it("verifies the staged app before creating the branded DMG", () => {
    expect(read("src/desktop/scripts/pack-mac.cjs")).toMatch(/verifyMacSeal\(path.join\(staging, 'KeyShield.app'\)\);\s*createBrandedDmg\(staging, dmgPath\);/);
  });

  it.runIf(process.platform === "darwin" && Boolean(process.env.KS_MAC_VERIFY_APP))("strictly verifies the built Mac app, including nested helpers and frameworks", () => {
    execFileSync("codesign", ["--verify", "--deep", "--strict", process.env.KS_MAC_VERIFY_APP!], { stdio: "pipe" });
  });

  it.runIf(Boolean(process.env.KS_MAC_VERIFY_APP))("ships no Railway host in the packaged ASAR or renderer", () => {
    const resources = join(process.env.KS_MAC_VERIFY_APP!, "Contents/Resources");
    expect(readFileSync(join(resources, "app.asar")).toString("utf8")).not.toMatch(/railway/i);
    for (const name of readdirSync(join(resources, "renderer/assets"))) {
      expect(readFileSync(join(resources, "renderer/assets", name)).toString("utf8"), name).not.toContain("keyshield-production.up.railway.app");
    }
  });

  it("overlays only the desktop endpoint policy in memory without modifying shared source", () => {
    const { rendererPolicyPlugin, rendererPolicyRevision } = require("../src/desktop/scripts/build-renderer.cjs");
    const source = tempDir();
    const policy = join(source, "src/web/lib/host-deploy.ts");
    mkdirSync(join(source, "src/web/lib"), { recursive: true });
    writeFileSync(policy, "original pinned policy");
    expect(rendererPolicyRevision()).toMatchObject({ file: "src/desktop/host-deploy.ts", target: "src/web/lib/host-deploy.ts", sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    const plugin = rendererPolicyPlugin(source);
    expect(plugin.load(policy)).toBe(read("src/desktop/host-deploy.ts"));
    expect(plugin.load(`${policy}?v=synthetic`)).toBe(read("src/desktop/host-deploy.ts"));
    const alias = join(tempDir(), "source-alias");
    symlinkSync(source, alias);
    expect(rendererPolicyPlugin(alias).load(realpathSync(policy))).toBe(read("src/desktop/host-deploy.ts"));
    expect(plugin.load("")).toBe(null);
    expect(plugin.load(join(source, "src/web/lib/auth.ts"))).toBe(null);
    expect(readFileSync(policy, "utf8")).toBe("original pinned policy");
    expect(() => rendererPolicyPlugin(source, () => { throw new Error("synthetic build failure"); }).load(policy)).toThrow("synthetic build failure");
    expect(readFileSync(policy, "utf8")).toBe("original pinned policy");
  });

  it("excludes custom release artifacts while keeping similarly named source paths", () => {
    const { createPackagerIgnore } = require("../src/desktop/scripts/pack-mac.cjs");
    const ignore = createPackagerIgnore(resolve(root, "src/desktop/builds/../builds/tester"));
    for (const file of ["/builds/tester", "/builds/tester/KeyShield.dmg", "/builds/tester/KeyShield.zip", "/builds/tester/dmg-root/KeyShield.app", "/release/old.dmg", "/out/app"]) {
      expect(ignore(file), file).toBe(true);
    }
    for (const file of ["", "/main.cjs", "/builds/tester-other/config.json"]) expect(ignore(file), file).toBe(false);
    expect(createPackagerIgnore(resolve(root, "../external-release"))("/main.cjs")).toBe(false);
    expect(() => createPackagerIgnore(resolve(root, "src/desktop"))).toThrow("Release directory must not be the desktop source root");
  });

  it("stages a DMG without executable install helpers or security override advice", () => {
    const { stageDmgContents } = require("../src/desktop/scripts/pack-mac.cjs");
    const source = makeElectron33Fixture(tempDir());
    const staging = tempDir();
    writeFileSync(join(staging, "Open-KeyShield.command"), "stale helper");
    const buildInfo = join(tempDir(), "BUILD-INFO.txt");
    writeFileSync(buildInfo, "synthetic build");
    stageDmgContents(source, staging, buildInfo);
    expect(readdirSync(staging).sort()).toEqual([".background", "Applications", "BUILD-INFO.txt", "KeyShield.app", "OPEN-ME.txt"]);
    expect(readdirSync(join(staging, ".background"))).toEqual(["installer.png"]);
    const background = readFileSync(join(staging, ".background", "installer.png"));
    expect(background.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(background.readUInt32BE(16)).toBe(720);
    expect(background.readUInt32BE(20)).toBe(560);
    expect(preflight.inspectMacBundle(join(staging, "KeyShield.app")).ok).toBe(true);
    expect(readFileSync(join(staging, "OPEN-ME.txt"), "utf8")).toContain("Local synthetic test build — not signed with a Developer ID and not notarized; macOS Gatekeeper protections are left intact.");
    expect(existsSync(resolve(root, "src/desktop/Open-KeyShield.command"))).toBe(false);
    for (const file of ["main.cjs", "OPEN-ME.txt", "README.md", "scripts/pack-mac.cjs"]) {
      expect(read(`src/desktop/${file}`)).not.toMatch(/xattr|spctl|--no-quarantine|right[- ]click.{0,40}open|open anyway|disabl.{0,40}gatekeeper/i);
    }
    expect(read("src/desktop/boot.html")).toContain("Retry the app");
    expect(read("src/desktop/boot.html")).toContain("Copy diagnostics");
  });

  it("refuses to stage a missing app instead of providing an install helper fallback", () => {
    const { stageDmgContents } = require("../src/desktop/scripts/pack-mac.cjs");
    expect(() => stageDmgContents(join(tempDir(), "missing.app"), tempDir(), "missing-build-info")).toThrow();
  });

  it("configures the Finder background, bounds, and all four visible icon positions", () => {
    const { finderPresentation } = require("../src/desktop/scripts/pack-mac.cjs");
    const script = finderPresentation();
    for (const value of ["icon view", "not arranged", ".background/installer.png", "{120, 90, 840, 672}", "{176, 245}", "{544, 245}", "{92, 420}", "{260, 420}", "label position of options to bottom", "shows icon preview of options to false"]) {
      expect(script).toContain(value);
    }
    const svg = read("src/desktop/assets/dmg-background.svg");
    for (const value of ["#0b1226", "#131c39", "#243365", "Drag KeyShield to Applications", "Local test build — unsigned, not notarized"]) expect(svg).toContain(value);
  });

  it.each(["success", "finder-error", "missing-metadata", "convert-error"])("creates and cleans up a writable Finder image: %s", (outcome) => {
    const { createBrandedDmg } = require("../src/desktop/scripts/pack-mac.cjs");
    const dest = tempDir();
    const calls: string[][] = [];
    const execute = (command: string, args: string[]) => {
      calls.push([command, ...args]);
      if (command === "osascript") {
        if (outcome === "finder-error") throw new Error("Finder unavailable");
        if (outcome !== "missing-metadata") writeFileSync(join(args[2], ".DS_Store"), "synthetic metadata");
      }
      if (args[0] === "convert" && outcome === "convert-error") throw new Error("conversion failed");
    };
    const create = () => createBrandedDmg("staging", join(dest, "KeyShield.dmg"), execute);
    if (outcome === "success") expect(create).not.toThrow();
    else expect(create).toThrow(outcome === "finder-error" ? /Finder unavailable/ : outcome === "missing-metadata" ? /did not save/ : /conversion failed/);
    expect(calls[0]).toContain("UDRW");
    expect(calls[1]).toContain("-readwrite");
    expect(calls.filter((args) => args[1] === "detach")).toHaveLength(1);
    expect(calls.some((args) => args.includes("UDZO"))).toBe(outcome === "success" || outcome === "convert-error");
    expect(readdirSync(dest)).toEqual([]);
  });

  it("shows a local navy shield loading screen without replacing fail-closed diagnostics", () => {
    const loading = read("src/desktop/loading.html");
    expect(loading).toContain("background: #0b1226");
    expect(loading).toContain("Loading KeyShield…");
    expect(loading).toContain('<svg width="48"');
    expect(loading).toContain("default-src 'none'");
    expect(loading).not.toContain("<script");
    expect(read("src/desktop/main.cjs")).toContain("local loading screen shown");
    expect(read("src/desktop/scripts/pack-mac.cjs")).toContain("path.join(desktopDir, 'loading.html')");
    expect(read("src/desktop/boot.html")).toContain("window.keyshieldRedaction.redact");
  });

  it("uses the shared shield on a navy rounded square with a transparent PNG master", () => {
    const svg = read("src/desktop/assets/app-icon.svg");
    const shield = "M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z";
    expect(svg).toContain(shield);
    expect(read("src/web/components/AuthScreen.tsx")).toContain(shield);
    expect(svg).toContain('fill="#0b1226"');
    expect(svg).toContain('rx="200"');
    const png = readFileSync(resolve(root, "src/desktop/assets/app-icon.png"));
    expect(png.readUInt32BE(16)).toBe(1024);
    expect(png.readUInt32BE(20)).toBe(1024);
    expect(png[25]).toBe(6);
    expect(read("src/desktop/scripts/pack-mac.cjs")).toContain("icon: icns || iconPng");
    expect(read("src/desktop/scripts/pack-mac.cjs")).not.toContain("drawIconPng");
  });

  it("generates all ten iconutil inputs from the shield master and removes the iconset", () => {
    const { makeIcns } = require("../src/desktop/scripts/pack-mac.cjs");
    const output = tempDir();
    const calls: string[][] = [];
    const icon = makeIcns("darwin", (command: string, args: string[]) => calls.push([command, ...args]), output);
    expect(icon).toBe(join(output, "KeyShield.icns"));
    expect(calls.filter(([command]) => command === "sips").map((args) => Number(args[2]))).toEqual([16, 32, 32, 64, 128, 256, 256, 512, 512, 1024]);
    for (const args of calls.filter(([command]) => command === "sips")) expect(args[4]).toBe(resolve(root, "src/desktop/assets/app-icon.png"));
    expect(calls[10]).toEqual(["iconutil", "-c", "icns", join(output, "KeyShield.iconset"), "-o", icon]);
    expect(existsSync(join(output, "KeyShield.iconset"))).toBe(false);
  });

  it.each(["sips", "iconutil"])("aborts and cleans up a failed Mac icon build: %s", (failure) => {
    const { makeIcns } = require("../src/desktop/scripts/pack-mac.cjs");
    const output = tempDir();
    expect(() => makeIcns("darwin", (command: string) => {
      if (command === failure) throw new Error("synthetic icon failure");
    }, output)).toThrow("synthetic icon failure");
    expect(existsSync(join(output, "KeyShield.iconset"))).toBe(false);
  });

  it("does not invoke Mac icon tools on other platforms", () => {
    const { makeIcns } = require("../src/desktop/scripts/pack-mac.cjs");
    expect(makeIcns("linux", () => { throw new Error("unexpected native tool"); }, tempDir())).toBeNull();
  });
});
