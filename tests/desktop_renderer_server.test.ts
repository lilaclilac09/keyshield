import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const require = createRequire(import.meta.url);
const { redact } = require("../src/desktop/redaction.js");
const rendererServer = require("../src/desktop/renderer-server.cjs") as {
  contentTypeFor: (file: string) => string;
  resolveRendererFile: (rootDir: string, requestPath: string) => string | null;
  isNavigationRequest: (request: { headers: { get: (name: string) => string | null } }) => boolean;
  serveDashboardRequest: (
    rootDir: string,
    request: { url: string; headers: { get: (name: string) => string | null } },
  ) => Response;
  hasRenderer: (rootDir: string) => boolean;
};
const diagnosticsModule = require("../src/desktop/diagnostics.cjs") as {
  createDiagnostics: (logPath: string) => {
    logPath: string;
    log: (line: string) => void;
    recordRendererError: (message: string, source: string) => void;
    recentErrors: () => { message: string; source: string }[];
    summary: () => string;
  };
};
const buildRenderer = require("../src/desktop/scripts/build-renderer.cjs") as {
  verifyRendererDist: (dist: string) => { ok: boolean; missing: string[]; assets: string[] };
};

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ks-renderer-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeRenderer(dir: string): string {
  mkdirSync(join(dir, "assets"), { recursive: true });
  writeFileSync(join(dir, "index.html"), "<html><body><div id=\"root\"></div></body></html>");
  writeFileSync(join(dir, "assets", "index-abc.js"), "console.log('app');");
  writeFileSync(join(dir, "assets", "index-abc.css"), "body { color: red; }");
  return dir;
}

function fakeRequest(url: string, accept: string): { url: string; headers: { get: (name: string) => string | null } } {
  return {
    url,
    headers: { get: (name: string) => (name === "accept" ? accept : null) },
  };
}

describe("renderer server", () => {
  it("assigns explicit content types", () => {
    expect(rendererServer.contentTypeFor("index.html")).toContain("text/html");
    expect(rendererServer.contentTypeFor("app.js")).toContain("text/javascript");
    expect(rendererServer.contentTypeFor("app.css")).toContain("text/css");
    expect(rendererServer.contentTypeFor("data.json")).toContain("application/json");
    expect(rendererServer.contentTypeFor("weird.bin")).toBe("application/octet-stream");
  });

  it("keeps resolved files inside the renderer root", () => {
    const dir = tempDir();
    expect(rendererServer.resolveRendererFile(dir, "/")).toBe(join(dir, "index.html"));
    expect(rendererServer.resolveRendererFile(dir, "/assets/app.js")).toBe(join(dir, "assets", "app.js"));
    expect(rendererServer.resolveRendererFile(dir, "/../../etc/passwd")).toBeNull();
    expect(rendererServer.resolveRendererFile(dir, "/%2e%2e/%2e%2e/etc/passwd")).toBeNull();
  });

  it("serves the entry page and assets with the right types", async () => {
    const dir = makeRenderer(tempDir());
    const page = rendererServer.serveDashboardRequest(dir, fakeRequest("https://app.ks.aileena.xyz/", "text/html"));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("id=\"root\"");

    const js = rendererServer.serveDashboardRequest(
      dir,
      fakeRequest("https://app.ks.aileena.xyz/assets/index-abc.js", "*/*"),
    );
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("text/javascript");
  });

  it("falls back to index.html only for navigations, not for missing assets", async () => {
    const dir = makeRenderer(tempDir());
    const nav = rendererServer.serveDashboardRequest(
      dir,
      fakeRequest("https://app.ks.aileena.xyz/some/route", "text/html,application/xhtml+xml"),
    );
    expect(nav.status).toBe(200);
    expect(await nav.text()).toContain("id=\"root\"");

    const missingAsset = rendererServer.serveDashboardRequest(
      dir,
      fakeRequest("https://app.ks.aileena.xyz/assets/index-missing.js", "*/*"),
    );
    expect(missingAsset.status).toBe(404);
    expect(await missingAsset.text()).not.toContain("<html>");
  });

  it("refuses traversal attempts", () => {
    const dir = makeRenderer(tempDir());
    // %2f survives URL parsing, so the guard itself must catch it.
    const res = rendererServer.serveDashboardRequest(
      dir,
      fakeRequest("https://app.ks.aileena.xyz/..%2f..%2fetc/passwd", "text/html"),
    );
    expect(res.status).toBe(403);
  });

  it("never serves files outside the renderer root", async () => {
    const dir = makeRenderer(tempDir());
    // The URL parser normalises %2e%2e dot segments away before the
    // handler sees them, so this lands inside the root and gets the SPA
    // fallback — never /etc/passwd.
    const res = rendererServer.serveDashboardRequest(
      dir,
      fakeRequest("https://app.ks.aileena.xyz/%2e%2e/%2e%2e/etc/passwd", "text/html"),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("id=\"root\"");
  });

  it("reports whether a renderer exists", () => {
    const dir = tempDir();
    expect(rendererServer.hasRenderer(dir)).toBe(false);
    makeRenderer(dir);
    expect(rendererServer.hasRenderer(dir)).toBe(true);
  });
});

describe("diagnostics log", () => {
  it("writes a log file and summarises captured renderer errors", () => {
    const dir = tempDir();
    const logPath = join(dir, "keyshield-desktop.log");
    const diag = diagnosticsModule.createDiagnostics(logPath);
    diag.log("starting");
    diag.recordRendererError("Cannot access X before initialization", "index-abc.js");
    expect(existsSync(logPath)).toBe(true);
    expect(readFileSync(logPath, "utf8")).toContain("starting");
    expect(readFileSync(logPath, "utf8")).toContain("Cannot access X");
    expect(diag.recentErrors()).toHaveLength(1);
    expect(diag.summary()).toContain("Cannot access X before initialization");
    expect(diag.summary()).toContain(redact(logPath));
  });

  it("keeps only the most recent renderer errors", () => {
    const dir = tempDir();
    const diag = diagnosticsModule.createDiagnostics(join(dir, "log.txt"));
    for (let i = 0; i < 55; i++) diag.recordRendererError(`error ${i}`, "");
    expect(diag.recentErrors()).toHaveLength(50);
    expect(diag.recentErrors()[49].message).toBe("error 54");
  });
});

describe("renderer build verification", () => {
  it("accepts a complete Vite output", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "index.html"),
      '<script src="/assets/index-abc.js"></script><link href="/assets/index-abc.css">',
    );
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "assets", "index-abc.js"), "console.log(1);");
    writeFileSync(join(dir, "assets", "index-abc.css"), "body{}");
    const report = buildRenderer.verifyRendererDist(dir);
    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.assets.length).toBeGreaterThanOrEqual(2);
  });

  it("rejects a build whose referenced assets are missing", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "index.html"),
      '<script src="/assets/index-abc.js"></script><link href="/assets/index-abc.css">',
    );
    mkdirSync(join(dir, "assets"), { recursive: true });
    writeFileSync(join(dir, "assets", "index-abc.js"), "console.log(1);");
    // The CSS file the page references is not on disk.
    const report = buildRenderer.verifyRendererDist(dir);
    expect(report.ok).toBe(false);
    expect(report.missing.some((file) => file.endsWith("index-abc.css"))).toBe(true);
  });

  it("rejects a build with no assets at all, even when index.html exists", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "index.html"), "<html></html>");
    const report = buildRenderer.verifyRendererDist(dir);
    expect(report.ok).toBe(false);
  });

  it("rejects a missing index.html", () => {
    const dir = tempDir();
    const report = buildRenderer.verifyRendererDist(dir);
    expect(report.ok).toBe(false);
    expect(report.missing.some((file) => file.endsWith("index.html"))).toBe(true);
  });
});
