/**
 * Stage 3 — Proxy E2E & upstream fault injection.
 *
 * A Node HTTP/SSE mock plays an AI provider. The Python /proxy route
 * is the system under test: it holds an estimate, reads the socket,
 * and meters only a verified prefix. Chain env is unset, so a fault
 * cannot sign mpp_settle.
 *
 *   a) TCP drop after ~300 of 1000 advertised tokens
 *   b) Upstream 502 / 504
 *   c) HTTP 200 with a zero-byte body
 *   d) Truncated JSON that fails SHA-256 fulfillment
 */
import { execFile } from "node:child_process";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = process.env.KS_PYTHON ?? "/workspace/.venv/bin/python";
const DRIVER = join(ROOT, "tests/proxy_fault_injection_driver.py");

const ADVERTISED_TOKENS = 1000;
const DELIVERED_TOKENS = 300;

export function disconnectSseBody(
  advertised = ADVERTISED_TOKENS,
  delivered = DELIVERED_TOKENS,
): Buffer {
  const prefix = 'data: {"choices":[{"delta":{"content":"';
  const suffix = `"}}],"usage":{"total_tokens":${advertised}}}\n\n`;
  const pad = Math.max(0, delivered * 4 - prefix.length - suffix.length);
  return Buffer.from(prefix + "x".repeat(pad) + suffix);
}

function startMock(): Promise<{ url: string; close: () => Promise<void> }> {
  const body = disconnectSseBody();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const parts = url.pathname.split("/").filter(Boolean);
    const fromPath = parts[0] === "fault" ? parts[1] : "";
    const mode = String(
      fromPath || req.headers["x-fault-mode"] || url.searchParams.get("fault") || "",
    );
    const finish = (fn: () => void) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk as Buffer));
      req.on("end", fn);
    };

    if (mode === "disconnect") {
      finish(() => {
        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "close",
        });
        res.write(body, () => {
          setTimeout(() => res.destroy(), 40);
        });
      });
      return;
    }
    if (mode === "bad-gateway") {
      finish(() => {
        res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "bad gateway" } }));
      });
      return;
    }
    if (mode === "gateway-timeout") {
      finish(() => {
        res.writeHead(504, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "gateway timeout" } }));
      });
      return;
    }
    if (mode === "empty-200") {
      finish(() => {
        res.writeHead(200, { "content-type": "application/json", "content-length": "0" });
        res.end();
      });
      return;
    }
    if (mode === "malformed") {
      finish(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{ "choices": [{"message":');
      });
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "unknown fault mode" }));
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("mock server has no port"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
    server.on("error", reject);
  });
}

type Balances = {
  pending: number;
  settled: number;
  held: number;
  escrow: number | null;
};

type DriverOut = {
  mode: string;
  status: number;
  meter: string | null;
  hold: string | null;
  complete: string | null;
  body_len: number;
  before: Balances;
  after: Balances;
  final: Balances;
  attempts: { signed: number; success: number; artifact_tokens: number; artifact_rows: number };
  final_attempts: { signed: number; success: number };
  chain: string | null;
  just_settled: number;
};

async function runDriver(mockUrl: string, mode: string): Promise<DriverOut> {
  const dir = mkdtempSync(join(tmpdir(), "ks-fault-"));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONPATH: ROOT,
    KS_MPP_DB: join(dir, "mpp.db"),
    SERVER_SECRET: "KS-FAULT-INJECTION-SECRET-32B!!",
  };
  delete env.KS_MPP_SETTLER_KEY;
  delete env.KS_PLATFORM_USDC_ATA;
  delete env.KS_KEYSHIELD_PROGRAM_ID;
  const { stdout } = await execFileAsync(PYTHON, [DRIVER, mockUrl, mode], {
    cwd: ROOT,
    env,
    encoding: "utf-8",
    timeout: 60_000,
  });
  const line = stdout.trim().split("\n").filter(Boolean).at(-1);
  if (!line) {
    throw new Error(`driver produced no JSON for ${mode}: ${stdout}`);
  }
  return JSON.parse(line) as DriverOut;
}

let mock: { url: string; close: () => Promise<void> };

beforeAll(async () => {
  mock = await startMock();
}, 15_000);

afterAll(async () => {
  await mock.close();
});

describe("Proxy E2E & upstream fault injection", () => {
  it("a) abrupt disconnect bills only delivered tokens, never the advertised remainder", async () => {
    const expectedCeiling = Math.floor(disconnectSseBody().length / 4);
    expect(expectedCeiling).toBe(DELIVERED_TOKENS);
    expect(expectedCeiling).toBeLessThan(ADVERTISED_TOKENS);

    const out = await runDriver(mock.url, "disconnect");
    expect(out.status).toBe(200);
    expect(out.complete).toBe("0");
    expect(out.meter).toBe("held");
    expect(out.attempts.artifact_tokens).toBe(DELIVERED_TOKENS);
    expect(out.attempts.artifact_tokens).toBeLessThan(ADVERTISED_TOKENS);
    expect(out.after.settled).toBe(0);
    expect(out.final.settled).toBe(0);
    expect(out.just_settled).toBe(0);
    expect(out.attempts.signed).toBe(0);
    expect(out.final_attempts.signed).toBe(0);
    expect(out.after.pending).toBe(1000 + 2 * DELIVERED_TOKENS);
    expect(out.before.escrow).toBe(50_000);
  });

  it("b) upstream 502/504 leaves the session unmutated and signs no settlement", async () => {
    for (const mode of ["bad-gateway", "gateway-timeout"] as const) {
      const out = await runDriver(mock.url, mode);
      expect(out.status).toBe(mode === "bad-gateway" ? 502 : 504);
      expect(out.meter).toMatch(/^rejected:/);
      expect(out.after.pending).toBe(0);
      expect(out.after.settled).toBe(0);
      expect(out.after.held).toBe(0);
      expect(out.after.escrow).toBe(out.before.escrow);
      expect(out.attempts.signed).toBe(0);
      expect(out.attempts.success).toBe(0);
      expect(out.attempts.artifact_rows).toBe(0);
      expect(out.just_settled).toBe(0);
      expect(out.chain).not.toBe("signed");
    }
  });

  it("c) zero-byte HTTP 200 does not debit and returns a clean reject", async () => {
    const out = await runDriver(mock.url, "empty-200");
    expect(out.status).toBe(200);
    expect(out.meter).toMatch(/rejected:empty payload/);
    expect(out.after.pending).toBe(0);
    expect(out.after.settled).toBe(0);
    expect(out.after.held).toBe(0);
    expect(out.after.escrow).toBe(out.before.escrow);
    expect(out.attempts.signed).toBe(0);
    expect(out.attempts.artifact_rows).toBe(0);
    expect(out.just_settled).toBe(0);
  });

  it("d) malformed JSON fails artifact-hash verification and blocks the debit", async () => {
    const out = await runDriver(mock.url, "malformed");
    expect(out.status).toBe(200);
    expect(out.meter).toMatch(/rejected:garbage payload/);
    expect(out.after.pending).toBe(0);
    expect(out.after.settled).toBe(0);
    expect(out.after.held).toBe(0);
    expect(out.attempts.artifact_rows).toBe(0);
    expect(out.attempts.signed).toBe(0);
    expect(out.final_attempts.signed).toBe(0);
    expect(out.just_settled).toBe(0);
    expect(out.chain).not.toBe("signed");
  });
});
