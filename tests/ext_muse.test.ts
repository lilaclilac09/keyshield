import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DETECT_READY_VERSION, manifestHasDefaultPopup, manifestHasSessionBridge } from "../src/web/lib/ext-detect";

const root = resolve(__dirname, "..");
const ext = resolve(root, "src/extension");

function read(name: string): string {
  return readFileSync(resolve(ext, name), "utf8");
}

function loadManifest(name: string): Record<string, unknown> {
  return JSON.parse(read(name));
}

function applyBrowserApi(globalThisObj: Record<string, unknown>): Record<string, unknown> {
  const src = read("browser-api.js");
  const fn = new Function("globalThis", `${src}\nreturn globalThis;`);
  return fn(globalThisObj) as Record<string, unknown>;
}

describe("Muse / browser-agnostic KeyShield extension", () => {
  it("keeps the product name KeyShield and version 1.2.5", () => {
    const chrome = loadManifest("manifest.json");
    const muse = loadManifest("manifest.muse.json");
    const firefox = loadManifest("manifest.firefox.json");
    expect(chrome.name).toBe("KeyShield — Sovereign Vault");
    expect(muse.name).toBe("KeyShield — Sovereign Vault");
    expect(muse.short_name).toBe("KeyShield");
    expect(chrome.version).toBe(DETECT_READY_VERSION);
    expect(muse.version).toBe(DETECT_READY_VERSION);
    expect(firefox.version).toBe(DETECT_READY_VERSION);
    expect(JSON.stringify(muse)).toBe(JSON.stringify(firefox));
  });

  it("aliases chrome ↔ browser without rewriting call sites", () => {
    const chromium = applyBrowserApi({ chrome: { runtime: { id: "abc" }, storage: {} } });
    expect(chromium.browser).toBe(chromium.chrome);
    const gecko = applyBrowserApi({ browser: { runtime: { id: "xyz" }, storage: {} } });
    expect(gecko.chrome).toBe(gecko.browser);
  });

  it("Chrome keeps a service worker; Muse uses background.scripts", () => {
    const chrome = loadManifest("manifest.json") as {
      background: { service_worker?: string; scripts?: string[] };
      content_scripts: Array<{ js: string[] }>;
    };
    const muse = loadManifest("manifest.muse.json") as {
      manifest_version: number;
      background: { service_worker?: string; scripts?: string[] };
      externally_connectable?: unknown;
      content_scripts: Array<{ js: string[] }>;
    };
    expect(chrome.background.service_worker).toBe("background.js");
    expect(muse.manifest_version).toBe(3);
    expect(muse.background.scripts).toEqual(["browser-api.js", "background.js"]);
    expect(muse.background.service_worker).toBeUndefined();
    expect(muse.externally_connectable).toBeUndefined();
    expect(manifestHasDefaultPopup(muse)).toBe(true);
    expect(manifestHasSessionBridge(muse)).toBe(true);
    expect(JSON.stringify(chrome.content_scripts)).toContain("browser-api.js");
    expect(JSON.stringify(muse.content_scripts)).toContain("browser-api.js");
    expect(JSON.stringify(muse.content_scripts)).toContain("session-bridge.js");
  });

  it("forwards Path A dashboard messages without externally_connectable", () => {
    const bridge = read("session-bridge.js");
    const bg = read("background.js");
    const vault = readFileSync(resolve(root, "src/web/lib/vault-key.ts"), "utf8");
    const auth = readFileSync(resolve(root, "src/web/lib/auth.ts"), "utf8");
    expect(bridge).toContain("__ks_ext_message");
    expect(bridge).toContain("KS_VAULT_KEY_REGISTER");
    expect(bg).toContain("function handleDashboardBridge");
    expect(bg).toContain("function _isDashboardBridgeType");
    expect(bg).toContain("KS_VAULT_KEY_REGISTER");
    expect(bg).toContain("moz-extension:");
    expect(vault).toContain("__ks_ext_message");
    expect(auth).toContain("__ks_ext_message");
  });

  it("documents what Muse actually supports vs Chrome and how to load it", () => {
    const muse = read("MUSE.md");
    const readme = read("README.md");
    const hint = readFileSync(resolve(root, "src/web/components/ExtensionInstallHint.tsx"), "utf8");
    const docs = readFileSync(resolve(root, "src/web/components/sections/DocsSection.tsx"), "utf8");
    expect(muse).toContain("KeyShield — Sovereign Vault");
    expect(muse).toContain("manifest.muse.json");
    expect(muse).toContain("Cursor Muse Wonder");
    expect(muse).toContain("unpacked WebExtensions");
    expect(muse).not.toContain("polar-lab");
    expect(readme).toContain("manifest.muse.json");
    expect(hint).toContain("manifest.muse.json");
    expect(docs).toContain("manifest.muse.json");
    expect(hint).not.toMatch(/[\u4e00-\u9fff]/);
    expect(docs).not.toMatch(/[\u4e00-\u9fff]/);
  });
});
