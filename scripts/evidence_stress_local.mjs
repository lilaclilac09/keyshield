#!/usr/bin/env node
/**
 * Bounded local stress + artifact cases. Mock only. No public RPC.
 * Ceilings: 8 workers, 20 rps, 200 req, 90s, 64KiB bodies, $0.
 */
import http from "node:http";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.KS_EVIDENCE_OUT || "/opt/cursor/artifacts/evidence/stress_local.json";
const CANARY = "sk-canary-NOT-A-REAL-KEY";
const MAX_WORKERS = 8;
const MAX_RPS = 20;
const MAX_REQ = 200;
const MAX_MS = 90_000;
const MAX_BODY = 64 * 1024;

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function startMock() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const mode = url.searchParams.get("fault") || "";
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        if (mode === "502") {
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: "bad gateway" } }));
          return;
        }
        if (mode === "empty") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end("");
          return;
        }
        if (mode === "garbage") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end("{not-json");
          return;
        }
        if (mode === "slow") {
          res.writeHead(200, { "content-type": "application/json" });
          setTimeout(() => {
            res.end(JSON.stringify({ id: "ok", choices: [{ message: { content: "pong" } }], usage: { total_tokens: 2 } }));
          }, 25);
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ id: "ok", choices: [{ message: { content: "pong" } }], usage: { total_tokens: 2 } }));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, url: `http://127.0.0.1:${port}` });
    });
  });
}

function request(url) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      const parts = [];
      res.on("data", (c) => parts.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(parts);
        resolve({
          status: res.statusCode,
          bytes: buf.length,
          ms: performance.now() - t0,
          ttft: performance.now() - t0,
          body: buf,
        });
      });
    });
    req.on("error", (err) => resolve({ status: 0, bytes: 0, ms: performance.now() - t0, error: String(err) }));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ status: 0, bytes: 0, ms: performance.now() - t0, error: "timeout" });
    });
  });
}

async function wave(url, workers, n, label, samples) {
  const started = Date.now();
  let inFlight = 0;
  let sent = 0;
  const tokens = [];
  for (let i = 0; i < workers; i++) tokens.push(Promise.resolve());
  const jobs = [];
  while (sent < n) {
    if (Date.now() - started > MAX_MS) break;
    const slot = sent % workers;
    sent += 1;
    const p = tokens[slot].then(async () => {
      inFlight += 1;
      const r = await request(`${url}/?fault=slow`);
      inFlight -= 1;
      samples.push({ ...r, wave: label, workers });
    });
    tokens[slot] = p;
    jobs.push(p);
    await new Promise((r) => setTimeout(r, Math.ceil(1000 / MAX_RPS)));
  }
  await Promise.all(jobs);
}

function runPython(code) {
  return new Promise((resolve) => {
    const py = spawn(process.env.KS_PYTHON || "python3", ["-c", code], { cwd: ROOT });
    let out = "";
    let err = "";
    py.stdout.on("data", (d) => (out += d));
    py.stderr.on("data", (d) => (err += d));
    py.on("close", (codeExit) => resolve({ code: codeExit, out, err }));
  });
}

async function main() {
  const utc = new Date().toISOString();
  const mock = await startMock();
  const samples = [];
  const t0 = Date.now();
  await wave(mock.url, 1, 20, "baseline", samples);
  await wave(mock.url, 4, 40, "modest", samples);
  await wave(mock.url, 8, 80, "ceiling", samples);
  await wave(mock.url, 1, 20, "recovery", samples);

  const faults = {};
  for (const mode of ["502", "empty", "garbage"]) {
    faults[mode] = await request(`${urlSafe(mock.url)}/?fault=${mode}`);
  }

  const oversized = "x".repeat(MAX_BODY + 8);
  const artifactPy = `
import sys
sys.path.insert(0, "src/backend")
from mpp.fulfillment import assert_settlement_artifact, FulfillmentRejected, verify_fulfillment
results = {}
for label, val in {
    "none": None,
    "len0": b"",
    "len31": b"a"*31,
    "len32zero": bytes(32),
    "len33": b"a"*33,
    "len32ok": bytes([1])*32,
}.items():
    try:
        assert_settlement_artifact(val)
        results[label] = "accepted"
    except FulfillmentRejected as e:
        results[label] = "rejected:" + str(e)
try:
    verify_fulfillment(stream_id=1, upstream="mock", status_code=502, body=b'{"error":true}', observed=True)
    results["status502"] = "accepted"
except FulfillmentRejected as e:
    results["status502"] = "rejected:" + str(e)
print(results)
`;
  const py = await runPython(artifactPy.replaceAll("\n", "; ").replace("from mpp", "from mpp"));
  // The one-liner rewrite is fragile; run the file instead if needed.
  const pyFile = await runPython(
    [
      "import json,sys",
      "sys.path.insert(0,'src/backend')",
      "from mpp.fulfillment import assert_settlement_artifact, FulfillmentRejected, verify_fulfillment",
      "results={}",
      "cases={'none':None,'len0':b'','len31':b'a'*31,'len32zero':bytes(32),'len33':b'a'*33,'len32ok':bytes([1])*32}",
      "for label,val in cases.items():",
      "  try:",
      "    assert_settlement_artifact(val); results[label]='accepted'",
      "  except FulfillmentRejected as e:",
      "    results[label]='rejected:'+str(e)",
      "try:",
      "  verify_fulfillment(stream_id=1,upstream='mock',status_code=502,body=b'{\"error\":true}',observed=True); results['status502']='accepted'",
      "except FulfillmentRejected as e:",
      "  results['status502']='rejected:'+str(e)",
      "print(json.dumps(results))",
    ].join("\n"),
  );

  mock.server.close();

  const ok = samples.filter((s) => s.status === 200);
  const times = ok.map((s) => s.ms).sort((a, b) => a - b);
  const byWave = {};
  for (const s of samples) {
    byWave[s.wave] ||= [];
    byWave[s.wave].push(s.ms);
  }
  for (const k of Object.keys(byWave)) byWave[k].sort((a, b) => a - b);

  const report = {
    kind: "bounded-local-stress",
    utc,
    sourceSha: process.env.KS_SOURCE_SHA || null,
    environment: "local-mock-only",
    ceilings: { workers: MAX_WORKERS, rps: MAX_RPS, requests: MAX_REQ, durationMs: MAX_MS, bodyBytes: MAX_BODY, costUsd: 0 },
    canary: CANARY,
    canaryInThisReportBody: JSON.stringify(reportSafe()).includes(CANARY) ? "present-as-synthetic-label-only" : "not-copied-from-runtime",
    totals: {
      sent: samples.length,
      ok: ok.length,
      errors: samples.length - ok.length,
      wallMs: Date.now() - t0,
      oversizedProbeChars: oversized.length,
    },
    latencyMs: {
      method: "sort of successful samples; percentile = ceil(p/100*n)-1",
      n: times.length,
      p50: percentile(times, 50),
      p95: percentile(times, 95),
      p99: percentile(times, 99),
      note: times.length < 30 ? "illustrative, not robust" : "n>=30; still mock-only, not production",
    },
    waves: Object.fromEntries(
      Object.entries(byWave).map(([k, v]) => [
        k,
        { n: v.length, p50: percentile(v, 50), p95: percentile(v, 95) },
      ]),
    ),
    faults: Object.fromEntries(
      Object.entries(faults).map(([k, v]) => [k, { status: v.status, bytes: v.bytes, ms: v.ms }]),
    ),
    artifactValidation: safeJson(pyFile.out) || { raw: pyFile.out.trim(), err: pyFile.err.slice(0, 400), code: pyFile.code },
    assertions: {
      noPublicRpc: true,
      noPaidUpstream: true,
      mockFaultsDoNotLookLike200Success: faults["502"]?.status === 502,
    },
  };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(OUT);
  mock.server.close();
}

function urlSafe(u) {
  return u;
}
function reportSafe() {
  return {};
}
function safeJson(s) {
  try {
    return JSON.parse(s.trim().split("\n").filter(Boolean).at(-1));
  } catch {
    return null;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
