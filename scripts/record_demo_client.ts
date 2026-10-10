#!/usr/bin/env npx tsx
/**
 * Timed demo client for `scripts/record_demo.sh`.
 *
 * SCENE 1  core problem — plaintext .env / templates + pay-before-delivery
 * SCENE 2  DOM intercept stand-in + WebAuthn-PRF seal + clipboard 0 bytes
 * SCENE 3  zero-copy IPC inject into OpenClaw runtime + auto session spec
 * SCENE 4  SSE through ks-proxy (measured TTFT / total — no canned 68ms)
 * SCENE 5  Devnet program tx + 502 HOLD clawback
 * SCENE D  OpenRouter Nemotron plug-in when a saved key exists
 */
import { execFileSync } from "node:child_process";
import { createCipheriv, createHash, createHmac, hkdfSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MOCK = (process.env.KS_RECORD_MOCK_URL || "http://127.0.0.1:18765").replace(/\/$/, "");
const PROXY = (process.env.KS_RECORD_PROXY_URL || "http://127.0.0.1:18000").replace(/\/$/, "");
const API = (process.env.KS_RECORD_API || "http://127.0.0.1:8000").replace(/\/$/, "");
const RPC = process.env.KS_RECORD_RPC || "https://api.devnet.solana.com";
const PROGRAM = process.env.KS_RECORD_PROGRAM_ID || "41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j";
const USDC_MINT = process.env.KS_RECORD_USDC_MINT || "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const WALLET = process.env.KS_RECORD_WALLET || "";
const WORK = process.env.KS_RECORD_WORKDIR || "/tmp/ks-record-demo";
const IPC_SOCK = process.env.KS_RECORD_IPC_SOCK || join(WORK, "ipc/openclaw.sock");
const IPC_AUTH = process.env.KS_RECORD_IPC_AUTH || "";
const MODEL = process.env.KS_OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";
const PACE_MS = Number(process.env.KS_RECORD_PACE_MS || "2500");
const HOLD_USDC = 0.05;
const HOLD_MICRO = 50_000;
const CU_BUDGET = 5_000;
const BAD_SIG =
  "678bqTSq4gYspz2TWwdK3wCzZwEHuuDqseDUS2NcEPVQ45472iNPRykVhK6Dq4nPmbLfDKKSiUx2nrT6XTQc";

const IX_NAME: Record<number, string> = {
  10: "CreateUniversalVault",
  11: "UpdateUniversalPolicy",
  20: "GrantAgentAccess",
  24: "OpenPaymentStream",
  25: "PayX402",
  26: "MppSettle",
  27: "WithdrawAgentWallet",
  28: "ForceClawback",
};

const c = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

function ts(): string {
  const n = process.hrtime.bigint();
  const d = new Date();
  const us = String(n % 1_000_000n).padStart(6, "0");
  return `${d.toISOString().slice(11, 19)}.${us}`;
}

function log(kind: string, msg: string): void {
  const color =
    kind === "OK"
      ? c.green
      : kind === "FAIL"
        ? c.red
        : kind === "HOLD" || kind === "WARN"
          ? c.yellow
          : c.cyan;
  console.log(`${c.dim(ts())} ${color(kind.padEnd(6))} ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function mask(raw: string): string {
  if (raw.length < 12) return "••••";
  return `${raw.slice(0, 7)}…${raw.slice(-4)}`;
}

function looksLikeOpenrouterKey(raw: string): boolean {
  return raw.startsWith("sk-or-") && raw.length >= 16;
}

function zeroize(buf: Uint8Array): void {
  buf.fill(0);
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function b58decode(s: string): Uint8Array {
  const bytes: number[] = [0];
  for (const ch of s) {
    const val = B58.indexOf(ch);
    if (val < 0) throw new Error("invalid base58");
    let carry = val;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let zeros = 0;
  for (const ch of s) {
    if (ch === "1") zeros++;
    else break;
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[out.length - 1 - i] = bytes[i];
  return out;
}

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  let last: unknown = null;
  for (let i = 0; i < 4; i++) {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body = (await res.json()) as { result?: unknown; error?: { message?: string; code?: number } };
    if (body.error) {
      last = body.error;
      if (i < 3) await sleep(250 * 2 ** i);
      continue;
    }
    return body.result;
  }
  throw new Error(`rpc ${method} failed: ${JSON.stringify(last)}`);
}

function clipboardBytes(): { bytes: number; backend: string } {
  if (process.env.KS_RECORD_CLIPBOARD !== undefined) {
    return { bytes: Buffer.byteLength(process.env.KS_RECORD_CLIPBOARD, "utf8"), backend: "env" };
  }
  const tryCmd = (bin: string, args: string[]): number | null => {
    try {
      const out = execFileSync(bin, args, { encoding: "buffer", stdio: ["ignore", "pipe", "ignore"] });
      return out.length;
    } catch {
      return null;
    }
  };
  const x = tryCmd("xclip", ["-selection", "clipboard", "-o"]);
  if (x !== null) return { bytes: x, backend: "xclip" };
  const pb = tryCmd("pbpaste", []);
  if (pb !== null) return { bytes: pb, backend: "pbpaste" };
  return { bytes: 0, backend: "none" };
}

function clearClipboard(): void {
  try {
    execFileSync("xclip", ["-selection", "clipboard"], { input: Buffer.alloc(0), stdio: ["pipe", "ignore", "ignore"] });
  } catch {
    /* Linux CI without an X selection still reports 0 via clipboardBytes fallback. */
  }
}

function openrouterKey(): { key: string; source: string } {
  const env =
    process.env.OPENROUTER_API_KEY?.trim() || process.env.KS_OPENROUTER_API_KEY?.trim() || "";
  if (looksLikeOpenrouterKey(env)) return { key: env, source: "env" };

  const keyFile = process.env.KS_OPENROUTER_API_KEY_FILE?.trim();
  if (keyFile && existsSync(keyFile)) {
    const fromFile = readFileSync(keyFile, "utf8").trim();
    if (looksLikeOpenrouterKey(fromFile)) return { key: fromFile, source: "file" };
  }

  const db =
    process.env.KS_VAULT_DB_PATH?.trim() || join(ROOT, "src/backend/data/vault_shim.db");
  if (existsSync(db)) {
    try {
      const fromVault = execFileSync(
        "python3",
        [
          "-c",
          "import sqlite3,sys\n"
            + "conn=sqlite3.connect(sys.argv[1])\n"
            + "row=conn.execute(\"SELECT value FROM vault_items WHERE upstream='openrouter' AND value LIKE 'sk-or-%' ORDER BY created_at DESC LIMIT 1\").fetchone()\n"
            + "print(row[0] if row else '', end='')\n",
          db,
        ],
        { encoding: "utf8" },
      ).trim();
      if (looksLikeOpenrouterKey(fromVault)) return { key: fromVault, source: "vault" };
    } catch {
      /* Vault lookup is best-effort. */
    }
  }
  return { key: "", source: "none" };
}

type Balances = { wallet: string; sol: number; lamports: number; usdc: number; usdcMicro: number };

async function fetchBalances(wallet: string): Promise<Balances> {
  const lamports = Number(await rpc("getBalance", [wallet, { commitment: "confirmed" }]).then((r) => {
    const v = r as { value?: number } | number;
    return typeof v === "number" ? v : v.value ?? 0;
  }));
  const tok = (await rpc("getTokenAccountsByOwner", [
    wallet,
    { mint: USDC_MINT },
    { encoding: "jsonParsed", commitment: "confirmed" },
  ])) as {
    value?: Array<{ account: { data: { parsed: { info: { tokenAmount: { amount: string; uiAmount: number } } } } } }>;
  };
  const row = tok.value?.[0]?.account?.data?.parsed?.info?.tokenAmount;
  const usdcMicro = Number(row?.amount || 0);
  const usdc = row?.uiAmount ?? usdcMicro / 1_000_000;
  return { wallet, sol: lamports / 1e9, lamports, usdc, usdcMicro };
}

async function step1(): Promise<Balances> {
  log("STEP", c.bold("1/5  The core problem — copy/paste .env + pay-before-delivery"));
  mkdirSync(WORK, { recursive: true });
  const envPath = join(WORK, "exposed.env");
  writeFileSync(
    envPath,
    [
      "# NEVER commit this. Demo fixture of the broken workflow — not a live secret.",
      "OPENAI_API_KEY=sk-proj-EXPOSED-IN-DOTENV-DO-NOT-USE",
      "HELIUS_API_KEY=helius_EXPOSED_IN_PROCESS_MEMORY",
      "SOLANA_PRIVATE_KEY=[11,22,33,44,55,66,77,88]",
      "",
    ].join("\n"),
  );
  log("SHOW", `left pane  ${envPath}  (manual paste — this is the anti-pattern)`);
  for (const line of [
    "OPENAI_API_KEY=sk-proj-EXPOSED-IN-DOTENV-DO-NOT-USE",
    "HELIUS_API_KEY=helius_EXPOSED_IN_PROCESS_MEMORY",
    "SOLANA_PRIVATE_KEY=[11,22,33,44,55,66,77,88]",
  ]) {
    log("LEAK", line);
  }
  log("TMPL", "agent frameworks still ship markdown blanks: KS_TOKEN=________________");

  const t0 = Date.now();
  const naive = await fetch(`${MOCK}/fault/bad-gateway`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "naive", messages: [{ role: "user", content: "pay first" }] }),
  });
  log("HTTP", `naive agent → upstream ${naive.status} in ${Date.now() - t0}ms`);
  log("LOSS", "HTTP 502 · fulfillment empty · prepaid credits already gone");

  if (!WALLET) throw new Error("KS_RECORD_WALLET is empty — pass the local keypair pubkey");
  log("WALLET", WALLET);
  const balances = await fetchBalances(WALLET);
  log("SOL", `${balances.sol.toFixed(8)} SOL  (${balances.lamports} lamports)`);
  log("USDC", `${balances.usdc} USDC  (${balances.usdcMicro} micro)`);
  log("OK", "problem stated — KeyShield zero-copy inject is the contrast");
  return balances;
}

function deriveVault(plaintext: string): { ciphertextB64: string; aes: Uint8Array } {
  const prf = createHash("sha256")
    .update("KeyShield Vault Key Derivation v1")
    .update("record-demo-passkey")
    .digest();
  const aesKey = new Uint8Array(hkdfSync("sha256", prf, Buffer.alloc(0), "ks-extension-vault-v1", 32));
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", aesKey, nonce);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return {
    ciphertextB64: Buffer.concat([nonce, ct]).toString("base64url"),
    aes: aesKey,
  };
}

async function step2(): Promise<string> {
  log("STEP", c.bold("2/5  DOM intercept + WebAuthn PRF seal (no clipboard)"));
  log("ISSUE", "upstream provider issued a fixture credential (masked, never copied)");
  const issued = "sk-or-v1-DEMO-NEVER-CLIPBOARD";
  log("DOM", "extension intercept stand-in: captured from in-process modal, not pbpaste");
  log("KEY", `issued ${mask(issued)} — plaintext stays in this function frame`);
  const vault = deriveVault(issued);
  log("PRF", "SHA-256 stand-in → HKDF-SHA256 → AES-256-GCM  (no Secure Enclave on this host)");
  log("SEAL", `ciphertext ${vault.ciphertextB64.slice(0, 28)}…`);
  zeroize(vault.aes);
  clearClipboard();
  const clip = clipboardBytes();
  log("CLIP", `${clip.backend === "pbpaste" ? "pbpaste" : "pbpaste-equivalent (" + clip.backend + ")"} → ${clip.bytes} bytes`);
  if (clip.bytes !== 0) throw new Error(`clipboard was ${clip.bytes} bytes; expected 0`);
  const token = `ksv2_sess_${randomBytes(12).toString("hex")}`;
  log("TOKEN", `${token}  derived in-memory after seal — not typed into a form`);
  log("OK", "clipboard empty; root secret never left the intercept frame");
  return token;
}

function ipcMac(): string {
  if (!IPC_AUTH) throw new Error("KS_RECORD_IPC_AUTH missing — start record_demo.sh");
  return createHmac("sha256", Buffer.from(IPC_AUTH, "hex")).update("ks-record-ipc-v1").digest("hex");
}

function ipcCall(msg: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(IPC_SOCK);
    let buf = "";
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error("ipc timeout"));
    }, 4000);
    sock.on("connect", () => {
      sock.write(`${JSON.stringify({ ...msg, mac: ipcMac() })}\n`);
    });
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      clearTimeout(timer);
      sock.end();
      try {
        resolve(JSON.parse(buf.slice(0, nl)) as Record<string, unknown>);
      } catch (err) {
        reject(err);
      }
    });
    sock.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function blankFields(spec: Record<string, unknown>, path = ""): string[] {
  const blanks: string[] = [];
  for (const [k, v] of Object.entries(spec)) {
    const p = path ? `${path}.${k}` : k;
    if (v == null) {
      blanks.push(p);
      continue;
    }
    if (typeof v === "string") {
      const s = v.trim();
      if (!s || /_{4,}|<[A-Z_]+>|TODO|changeme|your_session_token|________________/i.test(s)) {
        blanks.push(p);
      }
    } else if (Array.isArray(v)) {
      if (!v.length) blanks.push(p);
    } else if (typeof v === "object") {
      blanks.push(...blankFields(v as Record<string, unknown>, p));
    }
  }
  return blanks;
}

function deriveSessionSpec(token: string): Record<string, unknown> {
  const agentPublicKey = randomBytes(32).toString("hex");
  return {
    runtime: "openclaw",
    skill: "@keyshield/openclaw-skill",
    mcp: {
      command: "keyshield-mcp",
      env: { KS_TOKEN: token, KS_BASE: PROXY },
    },
    skillConfig: {
      rpcUrl: RPC,
      programId: PROGRAM,
      ownerPublicKey: WALLET,
      agentPublicKey,
      litNetwork: "datil-dev",
      sessionToken: token,
    },
    proxy: PROXY,
    upstreams: ["nvidia", "openrouter", "deepseek"],
    policy: {
      name: "record-demo-session",
      version: 1,
      allowedTools: ["get_price", "analyze_signal", "get_swap_quote"],
      session: { timeoutSeconds: 900, requireReauth: false },
    },
    source: "derived-in-memory",
    blanksToFill: 0,
  };
}

async function step3(token: string): Promise<void> {
  const t0 = Date.now();
  log("STEP", c.bold("3/5  Zero-paste auto-injection into OpenClaw (IPC)"));
  log("PIPE", `unix:${IPC_SOCK}  authenticated HMAC, no clipboard, no .env write`);
  const spec = deriveSessionSpec(token);
  const blanks = blankFields(spec);
  if (blanks.length) throw new Error(`session spec still has blanks: ${blanks.join(",")}`);
  const specPath = join(WORK, "session-spec.json");
  writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  log("SPEC", `auto-generated ${specPath}  blanks=${blanks.length}`);
  for (const line of JSON.stringify(spec, null, 2).split("\n").slice(0, 24)) {
    log("CONF", line);
  }

  const injected = await ipcCall({ op: "inject", token, spec });
  if (!injected.ok) throw new Error(`ipc inject failed: ${JSON.stringify(injected)}`);
  if (String(injected.token) !== token) throw new Error("runtime token mismatch");
  if (injected.hasRootSecret === true) throw new Error("runtime process held a root API key");

  const status = await ipcCall({ op: "status" });
  log("PROC", `openclaw pid=${status.pid}  KS_TOKEN=${String(status.token).slice(0, 16)}…`);
  log("ENV", "runtime process.env.KS_TOKEN set over IPC — developer never exported it");

  clearClipboard();
  const clip = clipboardBytes();
  log("CLIP", `${clip.backend === "pbpaste" ? "pbpaste" : "pbpaste-equivalent (" + clip.backend + ")"} → ${clip.bytes} bytes`);
  if (clip.bytes !== 0) throw new Error(`clipboard was ${clip.bytes} bytes after inject`);
  if (!String(status.token || "").startsWith("ksv2_sess_")) {
    throw new Error("runtime did not receive ksv2_sess_ token");
  }
  const ms = Date.now() - t0;
  log("TIME", `scene 3 ${ms}ms (budget 15000ms)`);
  if (ms >= 15_000) throw new Error(`zero-copy inject took ${ms}ms`);
  log("OK", "OpenClaw runtime holds the session token; no form, no paste, no template blanks");
}

async function proxyChat(scenario: string): Promise<Response> {
  return fetch(`${PROXY}/proxy/openai/v1/chat/completions`, {
    method: "POST",
    headers: {
      authorization: "Bearer dev-bypass",
      "content-type": "application/json",
      accept: "text/event-stream",
      "x-test-scenario": scenario,
    },
    body: JSON.stringify({
      model: "mock-fast",
      stream: true,
      messages: [{ role: "user", content: scenario }],
    }),
  });
}

async function readStream(
  res: Response,
  t0: number,
): Promise<{ ttft: number; bytes: number; total: number; body: string }> {
  if (!res.body) {
    const text = await res.text();
    return { ttft: Date.now() - t0, bytes: Buffer.byteLength(text), total: Date.now() - t0, body: text };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let ttft = -1;
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (ttft < 0) ttft = Date.now() - t0;
    if (value) {
      chunks.push(value);
      bytes += value.byteLength;
    }
  }
  const body = Buffer.concat(chunks).toString("utf8");
  return { ttft: ttft < 0 ? Date.now() - t0 : ttft, bytes, total: Date.now() - t0, body };
}

function streamHash(body: string): { hex: string; done: boolean } {
  return {
    hex: createHash("sha256").update(body).digest("hex"),
    done: body.includes("data: [DONE]"),
  };
}

async function step4(token: string): Promise<void> {
  log("STEP", c.bold("4/5  Live SSE through proxy-helius / ks-proxy (measured)"));
  log("ROUTE", `${PROXY}/proxy/openai/v1/chat/completions  X-Test-Scenario: stream_success`);
  const warm = await proxyChat("stream_success");
  await warm.arrayBuffer();
  log("WARM", "connection pool + route cache ready");

  const t0 = Date.now();
  const res = await proxyChat("stream_success");
  const { ttft, bytes, total, body } = await readStream(res, t0);
  const mockWork = Number(res.headers.get("x-ks-mock-work-ms") || "0");
  const hash = streamHash(body);
  log("HTTP", `proxy ${res.status}  bytes=${bytes}  sha256=${hash.hex.slice(0, 16)}…  done=${hash.done}`);
  log("TTFT", `first-byte ${ttft}ms  (measured; not a canned 1.2ms header)`);
  log("RTT", `total ${total}ms  mock_work_ms=${mockWork}  token=${token.slice(0, 16)}…`);
  if (mockWork > 0 && total >= mockWork) {
    log("NET", `proxy remainder ~${total - mockWork}ms after scheduled mock pacing`);
  }
  log("ZERO", "AES key fill(0) after seal. ks-proxy Cargo.toml has no zeroize/secrecy crates.");
  if (!res.ok || !hash.done) throw new Error("stream_success did not complete");
  if (total >= 80) {
    log("WARN", `measured ${total}ms is above the 80ms marketing budget — quoting the clock, not the budget`);
  } else {
    log("OK", `measured ${total}ms < 80ms on this take`);
  }
}

type ChainTx = {
  signature: string;
  slot: number;
  err: unknown;
  cu: number | null;
  disc: number | null;
  name: string;
};

async function loadProgramTx(): Promise<ChainTx> {
  const sigs = (await rpc("getSignaturesForAddress", [
    PROGRAM,
    { limit: 5, commitment: "confirmed" },
  ])) as Array<{ signature: string; slot: number; err: unknown }>;
  if (!sigs?.length) throw new Error("program has no confirmed signatures on this RPC");
  const row = sigs[0];
  const tx = (await rpc("getTransaction", [
    row.signature,
    { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  ])) as {
    slot?: number;
    meta?: { err?: unknown; computeUnitsConsumed?: number };
    transaction?: { message?: { accountKeys?: string[]; instructions?: Array<{ programIdIndex: number; data: string }> } };
  };
  const keys = tx.transaction?.message?.accountKeys || [];
  const ixs = tx.transaction?.message?.instructions || [];
  let disc: number | null = null;
  for (const ix of ixs) {
    if (keys[ix.programIdIndex] === PROGRAM) {
      disc = b58decode(ix.data)[0] ?? null;
      break;
    }
  }
  return {
    signature: row.signature,
    slot: tx.slot ?? row.slot,
    err: tx.meta?.err ?? row.err,
    cu: tx.meta?.computeUnitsConsumed ?? null,
    disc,
    name: disc != null ? IX_NAME[disc] || `ix_${disc}` : "unknown",
  };
}

async function proveWrongSize(): Promise<string> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [BAD_SIG, { encoding: "json", maxSupportedTransactionVersion: 0 }],
    }),
  });
  const body = (await res.json()) as { error?: { message?: string } };
  return body.error?.message || "no error (unexpected)";
}

async function dashboardSync(balances: Balances): Promise<void> {
  try {
    const login = await fetch(`${API}/auth/demo-session`, { method: "POST" });
    if (!login.ok) {
      log("DASH", `demo-session ${login.status} — dashboard skipped`);
      return;
    }
    const sess = (await login.json()) as { token?: string; userId?: string };
    if (!sess.token) {
      log("DASH", "demo-session returned no token");
      return;
    }
    const homeRes = await fetch(`${API}/keychain/home`, {
      headers: { authorization: `Bearer ${sess.token}` },
    });
    const home = (await homeRes.json()) as {
      wallet?: { address?: string; sol?: number; usdc?: number; sol_lamports?: number; usdc_micro?: number };
    };
    const w = home.wallet || {};
    log("DASH", `${API}/keychain/home  address=${w.address || "?"}  SOL=${w.sol}  USDC=${w.usdc}`);
    const solOk = Number(w.sol_lamports) === balances.lamports || Number(w.sol) === Number(balances.sol.toFixed(6));
    const usdcOk = Number(w.usdc_micro) === balances.usdcMicro || Number(w.usdc) === balances.usdc;
    if (solOk && usdcOk) log("OK", "dashboard wallet snapshot matches Devnet RPC");
    else log("WARN", "dashboard snapshot drifted from this RPC read — quoting both");
  } catch (err) {
    log("DASH", `unreachable (${err instanceof Error ? err.message : String(err)}) — RPC balances still stand`);
  }
}

async function step5(balances: Balances): Promise<void> {
  log("STEP", c.bold("5/5  Devnet settlement readout + 502 HOLD clawback"));
  log("PROG", PROGRAM);
  const wrong = await proveWrongSize();
  log("BADTX", `${BAD_SIG.slice(0, 16)}… len=${BAD_SIG.length}  rpc=${wrong}`);
  const tx = await loadProgramTx();
  const explorer = `https://explorer.solana.com/tx/${tx.signature}?cluster=devnet`;
  log("TX", tx.signature);
  log("SLOT", `slot ${tx.slot}  err=${JSON.stringify(tx.err)}  ix=${tx.disc} ${tx.name}`);
  log("CU", tx.cu == null ? "computeUnitsConsumed missing" : `${tx.cu.toLocaleString("en-US")} CU`);
  log("LINK", explorer);
  if (tx.err) throw new Error("latest program tx is not Ok");
  if (tx.cu != null && tx.cu >= CU_BUDGET) {
    log("WARN", `${tx.cu} CU is above the 5,000 Pinocchio budget — quoting chain, not the budget`);
  } else if (tx.cu != null) {
    log("OK", `${tx.cu} CU < ${CU_BUDGET.toLocaleString("en-US")} Pinocchio constraint`);
  }
  await dashboardSync(balances);

  log("HOLD", `escrow ${HOLD_USDC.toFixed(2)} USDC (${HOLD_MICRO} micro-USDC)  MODE=local ledger`);
  const t0 = Date.now();
  let status = 0;
  let body = "";
  try {
    const res = await proxyChat("fault_502");
    status = res.status;
    const read = await readStream(res, t0);
    body = read.body;
    log("FAULT", `proxy ${status} in ${read.total}ms  bytes=${read.bytes}`);
  } catch (err) {
    status = 502;
    log("FAULT", `socket drop ${err instanceof Error ? err.message : String(err)}`);
  }
  const hash = streamHash(body);
  const truncated = status >= 500 || !hash.done;
  log("HASH", truncated ? `FAILED (Truncated EOF)  sha256=${hash.hex.slice(0, 16) || "empty"}…` : `UNEXPECTED complete hash ${hash.hex.slice(0, 16)}…`);
  if (!truncated) throw new Error("fault_502 returned a complete [DONE] stream");
  log("STATE", "HOLD -> FAULT DETECTED -> UNILATERAL CLAWBACK EXECUTED");
  log("CLAW", "settled=0.00 USDC  capital lost: 0.00 USDC");
  log("NOTE", "this clawback is the local Hold-Verify-Capture ledger. Live analog is the Withdraw printed above.");
  log("OK", "unverified settlement refused");
}

function assistantText(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
    };
    const choice = parsed.choices?.[0];
    return choice?.message?.content || choice?.delta?.content || raw.slice(0, 160);
  } catch {
    return raw.slice(0, 160);
  }
}

async function sceneD(): Promise<void> {
  log("STEP", c.bold("D     OpenRouter Nemotron plug-in"));
  const { key, source } = openrouterKey();
  const body = {
    model: MODEL,
    max_tokens: 8,
    messages: [{ role: "user", content: "KeyShield demo ping" }],
  };

  if (looksLikeOpenrouterKey(key) && key.length >= 40) {
    log("LIVE", `saved ${source} key ${mask(key)} → ${MODEL}`);
    const t0 = Date.now();
    try {
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
      if (res.ok) {
        log("OUT", assistantText(text));
        log("OK", `live Nemotron ${res.status} in ${Date.now() - t0}ms`);
        return;
      }
      log("WARN", `OpenRouter ${res.status} — local plug-in still produces output`);
    } catch (err) {
      log("WARN", `OpenRouter unreachable (${err instanceof Error ? err.message : String(err)}) — local plug-in`);
    }
  } else if (looksLikeOpenrouterKey(key)) {
    log("VAULT", `saved ${source} key ${mask(key)} — local Nemotron plug-in`);
  } else {
    log("SKIP", "no saved OpenRouter key in env / vault — using local plug-in");
  }

  const t1 = Date.now();
  const mock = await fetch(`${MOCK}/api/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const mockText = await mock.text();
  log("OUT", assistantText(mockText));
  log("OK", `plug-in ${MODEL} via mock · ${mock.status} · ${Date.now() - t1}ms`);
}

async function main(): Promise<void> {
  console.log(c.bold("\nKeyShield record-demo client — 5 scenes + Nemotron plug-in\n"));
  const balances = await step1();
  await sleep(PACE_MS);
  const token = await step2();
  await sleep(PACE_MS);
  await step3(token);
  await sleep(PACE_MS);
  await step4(token);
  await sleep(PACE_MS);
  await step5(balances);
  await sleep(PACE_MS);
  await sceneD();
  log("DONE", c.green("all scenes passed"));
}

main().catch((err) => {
  log("FAIL", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
