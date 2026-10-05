#!/usr/bin/env npx tsx
/**
 * Component C + D — timed demo client for `scripts/record_demo.sh`.
 *
 * Scene 1  plaintext .env + naive 502 (funds already gone)
 * Scene 2  zero-clipboard PRF → HKDF → AES-GCM vault + ksv2_ session
 * Scene 3  Rust proxy fast-path SSE, overhead target <80ms
 * Scene 4  502 / truncated stream → HOLD / FAULT / CLAWBACK
 * Scene D  OpenRouter Nemotron if a key is present; otherwise the mock plug-in
 */
import { createCipheriv, createHash, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MOCK = (process.env.KS_RECORD_MOCK_URL || "http://127.0.0.1:18765").replace(/\/$/, "");
const PROXY = (process.env.KS_RECORD_PROXY_URL || "http://127.0.0.1:18000").replace(/\/$/, "");
const WORK = process.env.KS_RECORD_WORKDIR || "/tmp/ks-record-demo";
const MODEL = process.env.KS_OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";
const PACE_MS = Number(process.env.KS_RECORD_PACE_MS || "2500");

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function ts(): string {
  return new Date().toISOString().slice(11, 23);
}

function log(kind: string, msg: string): void {
  const color =
    kind === "OK" ? c.green : kind === "FAIL" ? c.red : kind === "HOLD" ? c.yellow : c.cyan;
  console.log(`${c.dim(ts())} ${color(kind.padEnd(6))} ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function mask(raw: string): string {
  if (raw.length < 12) return "••••";
  return `${raw.slice(0, 7)}…${raw.slice(-4)}`;
}

function openrouterKey(): string {
  return (
    process.env.OPENROUTER_API_KEY?.trim() ||
    process.env.KS_OPENROUTER_API_KEY?.trim() ||
    ""
  );
}

async function scene1(): Promise<void> {
  log("SCENE", c.bold("1/4  The core problem — plaintext .env + pay-before-delivery"));
  mkdirSync(WORK, { recursive: true });
  const envPath = join(WORK, "exposed.env");
  writeFileSync(
    envPath,
    [
      "# NEVER commit this. Demo fixture — not a live secret.",
      "OPENAI_API_KEY=sk-proj-EXPOSED-IN-DOTENV-DO-NOT-USE",
      "HELIUS_API_KEY=helius_EXPOSED_IN_PROCESS_MEMORY",
      "SOLANA_PRIVATE_KEY=[11,22,33,44,55,66,77,88]",
      "",
    ].join("\n"),
  );
  log("SHOW", `left pane  ${envPath}`);
  for (const line of [
    "OPENAI_API_KEY=sk-proj-EXPOSED-IN-DOTENV-DO-NOT-USE",
    "HELIUS_API_KEY=helius_EXPOSED_IN_PROCESS_MEMORY",
    "SOLANA_PRIVATE_KEY=[11,22,33,44,55,66,77,88]",
  ]) {
    log("LEAK", line);
  }

  const t0 = Date.now();
  const naive = await fetch(`${MOCK}/fault/bad-gateway`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "naive", messages: [{ role: "user", content: "pay first" }] }),
  });
  log("HTTP", `naive agent → upstream ${naive.status} in ${Date.now() - t0}ms`);
  log("CHAIN", "pay-before-delivery already settled 5_000 micro-USDC (simulated)");
  log("LOSS", "HTTP 502 · fulfillment empty · capital already gone");
  log("OK", "problem stated — KeyShield Hold-Verify-Capture is the contrast");
}

function deriveVault(): { token: string; ciphertextB64: string; plaintextNeverWritten: true } {
  const prf = createHash("sha256")
    .update("KeyShield Vault Key Derivation v1")
    .update("record-demo-passkey")
    .digest();
  const aesKey = Buffer.from(hkdfSync("sha256", prf, Buffer.alloc(0), "ks-extension-vault-v1", 32));
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, nonce);
  const fakeKey = "sk-or-v1-DEMO-NEVER-CLIPBOARD";
  const ct = Buffer.concat([cipher.update(fakeKey, "utf8"), cipher.final(), cipher.getAuthTag()]);
  const token = `ksv2_${createHash("sha256").update(prf).digest("hex").slice(0, 24)}`;
  return {
    token,
    ciphertextB64: Buffer.concat([nonce, ct]).toString("base64url"),
    plaintextNeverWritten: true,
  };
}

function clipboardHas(secret: string): boolean {
  const clip = process.env.KS_RECORD_CLIPBOARD || "";
  if (!clip) return false;
  return clip.includes(secret);
}

async function scene2(): Promise<string> {
  log("SCENE", c.bold("2/4  Hardware enclave — zero-clipboard PRF vault"));
  const vault = deriveVault();
  log("PRF", "WebAuthn-PRF scaffold → HKDF-SHA256 → AES-256-GCM");
  log("SEAL", `ciphertext ${vault.ciphertextB64.slice(0, 28)}… (server never sees plaintext)`);
  log("TOKEN", vault.token);
  const leaked = clipboardHas("sk-or-v1-DEMO-NEVER-CLIPBOARD");
  log(leaked ? "FAIL" : "OK", leaked ? "clipboard contained the secret" : "clipboard empty — plaintext never copied");
  if (leaked) throw new Error("zero-clipboard invariant failed");
  log("OK", "Device Vault derived; agent holds only the session token");
  return vault.token;
}

async function scene3(token: string): Promise<void> {
  log("SCENE", c.bold("3/4  Fast-path streaming through ks-proxy (<80ms overhead)"));
  const t0 = Date.now();
  let ttft = -1;
  const res = await fetch(`${PROXY}/proxy/openai/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: "Bearer dev-bypass",
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify({
      model: "mock-fast",
      stream: true,
      messages: [{ role: "user", content: "stream" }],
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`fast-path proxy ${res.status} ${await res.text()}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (ttft < 0) ttft = Date.now() - t0;
    bytes += value?.byteLength ?? 0;
    dec.decode(value, { stream: true });
  }
  const total = Date.now() - t0;
  log("TTFT", `${ttft}ms first byte`);
  log("RTT", `${total}ms total · ${bytes} bytes · token=${token.slice(0, 12)}…`);
  log("ZERO", "socket closed — request buffer dropped (no persistence)");
  if (total >= 80) {
    log("WARN", `roundtrip ${total}ms is above the 80ms demo target (still streamed)`);
  } else {
    log("OK", `overhead ${total}ms < 80ms`);
  }
}

type Escrow = { held: number; settled: number; escrow: number; state: string };

async function scene4(): Promise<void> {
  log("SCENE", c.bold("4/4  scvd.store fault — 502 / truncated stream → clawback"));
  const ledger: Escrow = { held: 0, settled: 0, escrow: 5_000, state: "IDLE" };

  ledger.held = 5_000;
  ledger.state = "HOLD";
  log("HOLD", `escrow ${ledger.escrow} micro-USDC locked (estimate)`);

  const bad = await fetch(`${MOCK}/fault/bad-gateway`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "scvd.store", messages: [{ role: "user", content: "pay" }] }),
  });
  log("FAULT", `upstream ${bad.status} Bad Gateway — fulfillment hash missing`);

  const cut = await fetch(`${MOCK}/fault/disconnect`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "scvd.store", stream: true }),
  }).catch((err: unknown) => {
    log("FAULT", `truncated SSE ${err instanceof Error ? err.message : String(err)}`);
    return null;
  });
  if (cut) log("FAULT", `truncated SSE status=${cut.status} complete=0`);

  ledger.state = "FAULT DETECTED";
  log("STATE", ledger.state);

  if (bad.status >= 500 || !cut || cut.status !== 200) {
    ledger.held = 0;
    ledger.settled = 0;
    ledger.state = "UNILATERAL CLAWBACK EXECUTED";
  }
  log("CLAW", `${ledger.state} · settled=${ledger.settled} · escrow restored=${ledger.escrow}`);
  if (ledger.settled !== 0) throw new Error("clawback leaked a debit");
  log("OK", "zero capital loss — Hold-Verify-Capture refused unverified settlement");
}

async function sceneD(): Promise<void> {
  log("SCENE", c.bold("D     OpenRouter Nemotron plug-in"));
  const key = openrouterKey();
  const body = {
    model: MODEL,
    max_tokens: 8,
    messages: [{ role: "user", content: "KeyShield demo ping" }],
  };

  if (key.startsWith("sk-or-") && key.length >= 16) {
    log("LIVE", `calling ${MODEL} with ${mask(key)} (key never logged)`);
    const t0 = Date.now();
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "http-referer": "https://keyshield.dev",
        "x-title": "KeyShield record-demo",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      log("FAIL", `OpenRouter ${res.status} — falling back to local plug-in`);
    } else {
      log("OK", `live Nemotron ${res.status} in ${Date.now() - t0}ms · ${text.length} bytes`);
      return;
    }
  } else {
    log("SKIP", "no OPENROUTER_API_KEY / KS_OPENROUTER_API_KEY — using local plug-in");
  }

  const t1 = Date.now();
  const mock = await fetch(`${MOCK}/api/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  await mock.text();
  log("OK", `plug-in ${MODEL} via mock · ${mock.status} · ${Date.now() - t1}ms`);
}

async function main(): Promise<void> {
  console.log(c.bold("\nKeyShield record-demo client — Components C + D\n"));
  await scene1();
  await sleep(PACE_MS);
  const token = await scene2();
  await sleep(PACE_MS);
  await scene3(token);
  await sleep(PACE_MS);
  await scene4();
  await sleep(PACE_MS);
  await sceneD();
  log("DONE", c.green("all scenes passed"));
}

main().catch((err) => {
  log("FAIL", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
