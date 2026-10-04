#!/usr/bin/env npx tsx
/**
 * Stage 4 — live RPC / Devnet load test with real inference.
 *
 * Connects one LLM call through KeyShield's Python proxy to a Solana
 * Devnet AgentPaymentStream:
 *
 *   0. Create Universal Vault (ix 10) + PAYMENT_ENABLED + GrantAgentAccess
 *   1. Open a 5 USDC stream (off-chain row + on-chain open_payment_stream)
 *   2. Client agent calls /proxy/<provider>/... with a session token
 *   3. Stream via SSE; proxy meters tokens (x-ks-mpp-meter / tokens)
 *   4. sha256(artifact) + session HMAC → POST capture → mpp_settle
 *   5. Assert spent == tokens_used * price_per_token
 *   6. Close; remaining USDC returns to the client wallet (withdraw)
 *      or stays in the client-owned stream ATA (conservation)
 *
 * Default is dry-run (exit 0). Live:
 *
 *   LIVE_E2E=1 npx tsx scripts/live_e2e_run.ts
 *
 * Required for live: a running API, user + provider keypairs, Devnet
 * USDC on the user ATA, KS_MPP_SETTLER_* + KS_VAULT_PDA on the API,
 * and an upstream key (OPENROUTER_API_KEY / KS_UPSTREAM_API_KEY).
 *
 * `/auth/login` is 403. This script uses wallet-login.
 */

import { createHash, createHmac, createPrivateKey, sign as ed25519Sign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

export const PROGRAM_ID_DEFAULT = "41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j";
export const USDC_MINT_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
export const DEPOSIT_MICRO_USDC = 5_000_000;
export const APS_SEED = Buffer.from("agent_payment_stream");
export const VAULT_SEED = Buffer.from("universal_vault");
export const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
export const ATA_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
export const LIVE_DISC = "ksaywal1";
export const VAULT_DISC = "univault";
export const CREATE_VAULT_DISC = 10;
export const UPDATE_POLICY_DISC = 11;
export const GRANT_ACCESS_DISC = 20;
export const REVOKE_DISC = 21;
export const VAULT_FLAGS_OFFSET = 56;
export const PAYMENT_ENABLED_FLAG = 0x08;
export const AGENT_GRANTS_START = 768;
export const AGENT_GRANT_SIZE = 128;
export const GRANT_IS_ACTIVE_OFFSET = 58;
export const AGENT_GRANT_REVOKED_AT_OFFSET = 120;
export const MAX_AGENTS = 8;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = join(ROOT, "scripts/fixtures/devnet-wallets.json");

const PROVIDER_PATH: Record<string, { path: string; defaultModel: string }> = {
  openrouter: {
    path: "/proxy/openrouter/api/v1/chat/completions",
    defaultModel: "meta-llama/llama-3.2-3b-instruct:free",
  },
  ollama: { path: "/proxy/ollama/v1/chat/completions", defaultModel: "llama3.2" },
  vllm: { path: "/proxy/vllm/v1/chat/completions", defaultModel: "Qwen/Qwen2.5-7B-Instruct" },
};

const tty = process.stdout.isTTY;
const c = {
  step: (s: string) => (tty ? `\x1b[36;1m${s}\x1b[0m` : s),
  ok: (s: string) => (tty ? `\x1b[32m${s}\x1b[0m` : s),
  err: (s: string) => (tty ? `\x1b[31m${s}\x1b[0m` : s),
  dim: (s: string) => (tty ? `\x1b[2m${s}\x1b[0m` : s),
};

export class LiveE2EError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

export function expandHome(p: string): string {
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}

export function u16le(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n >>> 0, 0);
  return b;
}

export function u32le(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

export function u64le(n: number | bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
  return b;
}

export function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

export function canonicalPreimage(args: {
  streamId: number;
  upstream: string;
  statusCode: number;
  body: Buffer;
  calls: number;
  tokens: number;
}): Buffer {
  const upstreamB = Buffer.from(args.upstream, "utf8");
  return Buffer.concat([
    u64le(args.streamId),
    u16le(upstreamB.length),
    upstreamB,
    u16le(args.statusCode),
    sha256(args.body),
    u64le(args.calls),
    u64le(args.tokens),
  ]);
}

export function artifactHashHex(args: {
  streamId: number;
  upstream: string;
  statusCode: number;
  body: Buffer;
  calls: number;
  tokens: number;
}): string {
  return sha256(canonicalPreimage(args)).toString("hex");
}

export function signCapture(sessionToken: string, artifactHash: string): string {
  const digest = Buffer.from(artifactHash.replace(/^0x/i, ""), "hex");
  if (digest.length !== 32) throw new LiveE2EError("artifact hash must be 32 bytes");
  return createHmac("sha256", sessionToken).update(digest).digest("hex");
}

export function expectedDebitMicro(tokens: number, ratePerToken: number, calls = 0, ratePerCall = 0): number {
  return tokens * ratePerToken + calls * ratePerCall;
}

export function parseSseUsageTokens(body: Buffer): number | null {
  let found: number | null = null;
  const text = body.toString("utf8");
  for (const block of text.split(/\n\n/)) {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter((line) => line && line !== "[DONE]");
    if (!dataLines.length) continue;
    try {
      const obj = JSON.parse(dataLines.join(""));
      const usage = obj?.usage;
      if (!usage || typeof usage !== "object") continue;
      if (usage.total_tokens != null) found = Math.max(0, Number(usage.total_tokens));
      else {
        const prompt = usage.prompt_tokens ?? usage.input_tokens;
        const completion = usage.completion_tokens ?? usage.output_tokens;
        if (prompt != null || completion != null) {
          found = Math.max(0, Number(prompt || 0) + Number(completion || 0));
        }
      }
    } catch {
      /* skip a partial SSE frame */
    }
  }
  return found;
}

export function meteredBodyFromProxy(payload: unknown): Buffer {
  if (payload && typeof payload === "object" && "raw" in payload && typeof (payload as { raw: unknown }).raw === "string") {
    return Buffer.from((payload as { raw: string }).raw, "utf8");
  }
  return Buffer.from(JSON.stringify(payload), "utf8");
}

export function deriveAta(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ATA_PROGRAM_ID,
  )[0];
}

export function deriveStreamPda(programId: PublicKey, agent: PublicKey, owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([APS_SEED, agent.toBuffer(), owner.toBuffer()], programId);
}

export function deriveVaultPda(programId: PublicKey, owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([VAULT_SEED, owner.toBuffer()], programId);
}

export function buildCreateUniversalVaultIx(
  programId: PublicKey,
  owner: PublicKey,
  vaultPda: PublicKey,
  bump: number,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([CREATE_VAULT_DISC, bump]),
  });
}

export function buildUpdateUniversalPolicyFlagsIx(
  programId: PublicKey,
  owner: PublicKey,
  vaultPda: PublicKey,
  flags = PAYMENT_ENABLED_FLAG,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: false },
      { pubkey: vaultPda, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat([Buffer.from([UPDATE_POLICY_DISC]), u32le(flags), Buffer.from([0])]),
  });
}

export function buildGrantAgentAccessIx(args: {
  programId: PublicKey;
  owner: PublicKey;
  vaultPda: PublicKey;
  agent: PublicKey;
  keyGroup?: number;
  rateLimitCalls?: number;
  rateLimitTokens?: number;
  sessionTimeout?: number;
  maxSpendMicroUsdc?: number;
  paymentStreamEnabled?: boolean;
}): TransactionInstruction {
  const keyGroup = args.keyGroup ?? 255;
  const rateCalls = args.rateLimitCalls ?? 0;
  const rateTokens = args.rateLimitTokens ?? 0;
  const timeout = args.sessionTimeout ?? 0;
  const maxSpend = args.maxSpendMicroUsdc ?? 0;
  const pay = args.paymentStreamEnabled ? 1 : 0;
  const data = Buffer.concat([
    Buffer.from([GRANT_ACCESS_DISC]),
    args.agent.toBuffer(),
    Buffer.from([keyGroup]),
    u32le(rateCalls),
    u32le(rateTokens),
    u64le(timeout),
    u64le(maxSpend),
    Buffer.from([pay]),
    u16le(0),
  ]);
  return new TransactionInstruction({
    programId: args.programId,
    keys: [
      { pubkey: args.owner, isSigner: true, isWritable: true },
      { pubkey: args.vaultPda, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function vaultHasPaymentsEnabled(data: Buffer): boolean {
  if (data.length < VAULT_FLAGS_OFFSET + 4) return false;
  return (data.readUInt32LE(VAULT_FLAGS_OFFSET) & PAYMENT_ENABLED_FLAG) !== 0;
}

export function vaultHasActiveGrant(data: Buffer, agent: PublicKey): boolean {
  if (data.length < AGENT_GRANTS_START + AGENT_GRANT_SIZE) return false;
  const want = agent.toBuffer();
  for (let i = 0; i < MAX_AGENTS; i++) {
    const off = AGENT_GRANTS_START + i * AGENT_GRANT_SIZE;
    if (!data.subarray(off, off + 32).equals(want)) continue;
    if (data[off + GRANT_IS_ACTIVE_OFFSET] !== 1) continue;
    const revoked = data.readBigInt64LE(off + AGENT_GRANT_REVOKED_AT_OFFSET);
    if (revoked === 0n) return true;
  }
  return false;
}

export function readTokenAmount(data: Buffer): bigint {
  return data.readBigUInt64LE(64);
}

export function readSpentTotal(streamData: Buffer): bigint {
  return streamData.readBigUInt64LE(176);
}

export function loadKeypair(path: string): Keypair {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(raw)) return Keypair.fromSecretKey(Uint8Array.from(raw));
  if (raw && Array.isArray(raw.secretKey)) return Keypair.fromSecretKey(Uint8Array.from(raw.secretKey));
  throw new LiveE2EError(`unrecognized keypair JSON at ${path}`);
}

export function signUtf8Ed25519(kp: Keypair, message: string): string {
  const seed = Buffer.from(kp.secretKey.slice(0, 32));
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const key = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  return ed25519Sign(null, Buffer.from(message, "utf8"), key).toString("base64");
}

export function settlementBindingHash(
  stream: PublicKey,
  seq: number,
  amount: number,
  artifact: Buffer,
): Buffer {
  if (artifact.length !== 32) throw new LiveE2EError("artifact hash must be 32 bytes");
  return sha256(Buffer.concat([stream.toBuffer(), u64le(seq), u64le(amount), artifact]));
}

export function signSettlementBinding(
  kp: Keypair,
  stream: PublicKey,
  seq: number,
  amount: number,
  artifactHex: string,
): string {
  const artifact = Buffer.from(artifactHex.replace(/^0x/i, ""), "hex");
  const message = settlementBindingHash(stream, seq, amount, artifact);
  const seed = Buffer.from(kp.secretKey.slice(0, 32));
  const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
  const key = createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
  return ed25519Sign(null, message, key).toString("hex");
}

function jsonToIx(ix: {
  programId: string;
  keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: string;
}): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.keys.map((k) => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: Buffer.from(ix.data, "base64"),
  });
}

function banner(title: string): void {
  console.log("\n" + c.step(`▶ ${title}`));
}

function ok(msg: string): void {
  console.log(`  ${c.ok("✓")} ${msg}`);
}

function detail(key: string, value: string | number | bigint): void {
  console.log(`    ${c.dim(key.padEnd(22))} ${value}`);
}

function envFlag(name: string, fallback = false): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

function envStr(name: string, fallback: string): string {
  const raw = (process.env[name] ?? "").trim();
  return raw || fallback;
}

export type LiveConfig = {
  dryRun: boolean;
  onchain: boolean;
  apiBase: string;
  rpcUrl: string;
  programId: PublicKey;
  usdcMint: PublicKey;
  provider: keyof typeof PROVIDER_PATH;
  model: string;
  deposit: number;
  ratePerToken: number;
  ratePerCall: number;
  userWalletPath: string;
  providerWalletPath: string;
  sessionToken: string;
  upstreamKey: string;
  vaultPda: string;
  allowEscrowResidual: boolean;
};

export function loadFixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;
}

export function resolveConfig(argv = process.argv.slice(2)): LiveConfig {
  const dryRun = argv.includes("--dry-run") || argv.includes("-n") || !envFlag("LIVE_E2E");
  const provider = envStr("KS_LIVE_PROVIDER", "openrouter") as keyof typeof PROVIDER_PATH;
  if (!PROVIDER_PATH[provider]) {
    throw new LiveE2EError(`KS_LIVE_PROVIDER must be openrouter|ollama|vllm, got ${provider}`, 2);
  }
  const generatedUser = join(ROOT, ".keyshield-devnet/user-devnet.json");
  const userDefault = existsSync(generatedUser)
    ? generatedUser
    : expandHome("~/.config/solana/id.json");
  const providerDefault = join(ROOT, ".keyshield-devnet/mpp-settler-devnet.json");
  return {
    dryRun,
    onchain: envFlag("LIVE_E2E_ONCHAIN", !dryRun),
    apiBase: envStr("KS_API_BASE", "http://127.0.0.1:8000").replace(/\/$/, ""),
    rpcUrl: envStr("KS_RPC_URL", envStr("KS_SOLANA_RPC_URL", "https://api.devnet.solana.com")),
    programId: new PublicKey(envStr("KS_PROGRAM_ID", envStr("KS_KEYSHIELD_PROGRAM_ID", PROGRAM_ID_DEFAULT))),
    usdcMint: new PublicKey(envStr("KS_USDC_MINT", USDC_MINT_DEVNET)),
    provider,
    model: envStr("KS_LIVE_MODEL", PROVIDER_PATH[provider].defaultModel),
    deposit: Number(envStr("KS_LIVE_DEPOSIT_MICRO", String(DEPOSIT_MICRO_USDC))),
    ratePerToken: Number(envStr("KS_LIVE_RATE_PER_TOKEN", "1")),
    ratePerCall: Number(envStr("KS_LIVE_RATE_PER_CALL", "0")),
    userWalletPath: expandHome(envStr("KS_USER_WALLET", userDefault)),
    providerWalletPath: expandHome(envStr("KS_PROVIDER_WALLET", providerDefault)),
    sessionToken: envStr("KS_SESSION_TOKEN", ""),
    upstreamKey: envStr("KS_UPSTREAM_API_KEY", envStr("OPENROUTER_API_KEY", envStr("OLLAMA_API_KEY", "ollama"))),
    vaultPda: envStr("KS_VAULT_PDA", ""),
    allowEscrowResidual: envFlag("LIVE_E2E_ALLOW_ESCROW_RESIDUAL", true),
  };
}

async function api(
  cfg: LiveConfig,
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<{ status: number; headers: Headers; body: unknown; text: string }> {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type") && init.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  const res = await fetch(`${cfg.apiBase}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* leave as text */
  }
  return { status: res.status, headers: res.headers, body, text };
}

async function apiOk(
  cfg: LiveConfig,
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<any> {
  const res = await api(cfg, path, init, token);
  if (res.status < 200 || res.status >= 300) {
    throw new LiveE2EError(`${init.method ?? "GET"} ${path} → ${res.status} ${res.text.slice(0, 240)}`);
  }
  return res.body;
}

async function sendIxs(
  conn: Connection,
  payer: Keypair,
  ixs: TransactionInstruction[],
): Promise<string> {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: payer.publicKey, blockhash, lastValidBlockHeight }).add(...ixs);
  tx.sign(payer);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  return sig;
}

export async function pythonParityCheck(): Promise<{
  hash: string;
  tokens: number;
  mac: string;
  binding: string;
}> {
  const body = Buffer.from(
    'data: {"choices":[{"delta":{"content":"hi"}}],"usage":{"total_tokens":12}}\n\n',
    "utf8",
  );
  const session = "ksv2_live_e2e_parity";
  const localHash = artifactHashHex({
    streamId: 7,
    upstream: "openrouter",
    statusCode: 200,
    body,
    calls: 1,
    tokens: 12,
  });
  const localMac = signCapture(session, localHash);
  const py = envStr("KS_PYTHON", existsSync("/workspace/.venv/bin/python") ? "/workspace/.venv/bin/python" : "python3");
  const script = `
from src.backend.mpp.fulfillment import canonical_preimage, sha256
from src.backend.mpp.capture import sign_artifact_hash
from src.backend.mpp.mpp_onchain import settlement_binding_hash
body = b'data: {"choices":[{"delta":{"content":"hi"}}],"usage":{"total_tokens":12}}\\n\\n'
pre = canonical_preimage(stream_id=7, upstream="openrouter", status_code=200, body=body, calls=1, tokens=12)
digest = sha256(pre).hex()
mac = sign_artifact_hash(${JSON.stringify(session)}, digest).hex()
binding = settlement_binding_hash(bytes([0x11]) * 32, 1, 120, bytes.fromhex(digest)).hex()
print(digest, 12, mac, binding)
`;
  const run = spawnSync(py, ["-c", script], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: ROOT },
  });
  if (run.status !== 0) {
    throw new LiveE2EError(`python parity failed: ${(run.stderr || run.stdout || "").slice(0, 400)}`, 1);
  }
  const [hash, tokens, mac, binding] = run.stdout.trim().split(/\s+/);
  if (hash !== localHash) throw new LiveE2EError(`artifact hash mismatch ts=${localHash} py=${hash}`);
  if (mac !== localMac) throw new LiveE2EError(`capture MAC mismatch ts=${localMac} py=${mac}`);
  if (Number(tokens) !== 12) throw new LiveE2EError(`token fixture drifted: ${tokens}`);
  const localBinding = settlementBindingHash(
    new PublicKey(Buffer.alloc(32, 0x11)),
    1,
    120,
    Buffer.from(localHash, "hex"),
  ).toString("hex");
  if (binding !== localBinding) {
    throw new LiveE2EError(`binding hash mismatch ts=${localBinding} py=${binding}`);
  }
  return { hash, tokens: 12, mac, binding };
}

async function ensureVaultAndGrant(
  conn: Connection,
  cfg: LiveConfig,
  user: Keypair,
  agent: PublicKey,
): Promise<PublicKey> {
  const [derivedVault, vaultBump] = deriveVaultPda(cfg.programId, user.publicKey);
  if (cfg.vaultPda && cfg.vaultPda !== derivedVault.toBase58()) {
    throw new LiveE2EError(
      `KS_VAULT_PDA ${cfg.vaultPda} ≠ derived ${derivedVault.toBase58()} for USER ${user.publicKey.toBase58()}`,
    );
  }
  detail("vault PDA", `${derivedVault.toBase58()} bump=${vaultBump}`);

  let info = await conn.getAccountInfo(derivedVault);
  if (!info) {
    const sig = await sendIxs(conn, user, [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      buildCreateUniversalVaultIx(cfg.programId, user.publicKey, derivedVault, vaultBump),
    ]);
    detail("create vault", sig);
    info = await conn.getAccountInfo(derivedVault);
    if (!info) throw new LiveE2EError("Universal Vault missing after CreateUniversalVault");
  }
  const disc = info.data.subarray(0, 8).toString("utf8");
  if (disc !== VAULT_DISC) {
    throw new LiveE2EError(`vault disc ${disc} ≠ ${VAULT_DISC}`);
  }
  ok(`Universal Vault on-chain (${info.data.length} bytes)`);

  if (!vaultHasPaymentsEnabled(info.data)) {
    const sig = await sendIxs(conn, user, [
      buildUpdateUniversalPolicyFlagsIx(cfg.programId, user.publicKey, derivedVault, PAYMENT_ENABLED_FLAG),
    ]);
    detail("enable payments", sig);
    info = await conn.getAccountInfo(derivedVault);
    if (!info || !vaultHasPaymentsEnabled(info.data)) {
      throw new LiveE2EError("vault_flags PAYMENT_ENABLED (0x08) not set after UpdateUniversalPolicy");
    }
  }
  ok("vault_flags.PAYMENT_ENABLED (0x08)");

  if (!vaultHasActiveGrant(info.data, agent)) {
    const sig = await sendIxs(conn, user, [
      buildGrantAgentAccessIx({
        programId: cfg.programId,
        owner: user.publicKey,
        vaultPda: derivedVault,
        agent,
        sessionTimeout: 0,
        maxSpendMicroUsdc: cfg.deposit,
        paymentStreamEnabled: true,
      }),
    ]);
    detail("grant agent", sig);
    info = await conn.getAccountInfo(derivedVault);
    if (!info || !vaultHasActiveGrant(info.data, agent)) {
      throw new LiveE2EError(`agent grant not active for ${agent.toBase58()}`);
    }
  }
  ok(`agent grant active for ${agent.toBase58()}`);
  return derivedVault;
}

async function walletLogin(cfg: LiveConfig, user: Keypair): Promise<string> {
  if (cfg.sessionToken) return cfg.sessionToken;
  const challenge = await apiOk(cfg, "/auth/wallet-challenge");
  const nonce = String(challenge.challenge || challenge.nonce || "");
  if (!nonce) throw new LiveE2EError("wallet-challenge returned no nonce");
  const signature = signUtf8Ed25519(user, nonce);
  const logged = await apiOk(cfg, "/auth/wallet-login", {
    method: "POST",
    body: JSON.stringify({
      walletAddress: user.publicKey.toBase58(),
      challenge: nonce,
      nonce,
      passphrase: "",
      signature,
    }),
  });
  if (!logged.token) throw new LiveE2EError("wallet-login returned no token");
  return String(logged.token);
}

async function dryRun(cfg: LiveConfig): Promise<number> {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Stage 4 live e2e — DRY RUN (set LIVE_E2E=1 to hit Devnet)  ║
╚══════════════════════════════════════════════════════════════╝`);

  banner("0. fixtures + crypto parity");
  const fixture = loadFixture();
  if (fixture.programId !== PROGRAM_ID_DEFAULT) {
    throw new LiveE2EError(`fixture programId ${fixture.programId} ≠ ${PROGRAM_ID_DEFAULT}`);
  }
  if (cfg.programId.toBase58() !== PROGRAM_ID_DEFAULT && !process.env.KS_PROGRAM_ID) {
    throw new LiveE2EError(`resolved program id ${cfg.programId.toBase58()} ≠ verified Devnet id`);
  }
  detail("program id", cfg.programId.toBase58());
  detail("usdc mint", cfg.usdcMint.toBase58());
  detail("deposit", `${cfg.deposit} micro-USDC`);
  detail("user wallet", cfg.userWalletPath);
  detail("provider wallet", cfg.providerWalletPath);
  detail("inference", `${cfg.provider} ${cfg.model}`);
  detail("user present", existsSync(cfg.userWalletPath) ? "yes" : "missing (live only)");
  detail("provider present", existsSync(cfg.providerWalletPath) ? "yes" : "missing (live only)");
  const parity = await pythonParityCheck();
  ok(`sha256(preimage) + HMAC-SHA256 match Python (${parity.hash.slice(0, 12)}…)`);
  ok(`Ed25519 binding sha256(stream||seq||debit||artifact) matches Python (${parity.binding.slice(0, 12)}…)`);

  const tokens = 12;
  const debit = expectedDebitMicro(tokens, cfg.ratePerToken, 0, cfg.ratePerCall);
  if (debit !== tokens * cfg.ratePerToken) {
    throw new LiveE2EError(`debit math ${debit} ≠ tokens*price ${tokens * cfg.ratePerToken}`);
  }
  ok(`settlement math: ${tokens} tokens × ${cfg.ratePerToken} = ${debit} micro-USDC`);

  banner("1–6. planned live path");
  console.log("    0. CreateUniversalVault (ix 10) + PAYMENT_ENABLED (0x08) + GrantAgentAccess (ix 20)");
  console.log(`    1. POST /mpp/streams  deposit=${cfg.deposit} rate=${cfg.ratePerToken}/token`);
  console.log("       then owner-signed open_payment_stream (ix 24)");
  console.log(`    2. wallet-login → POST ${PROVIDER_PATH[cfg.provider].path}`);
  console.log("    3. Accept: text/event-stream + stream:true; read x-ks-mpp-meter/tokens");
  console.log("    4. HMAC(session, artifact) + owner Ed25519 binding → POST /capture → mpp_settle");
  console.log("    5. assert spent_total == tokens_used * price_per_token");
  console.log("    6. close + revoke + withdraw; remaining USDC → client ATA");

  banner("backend probe (optional)");
  try {
    const health = await api(cfg, "/health");
    detail("GET /health", String(health.status));
    ok(health.status === 200 ? "API reachable" : "API responded (existing /health smoke may be non-200)");
  } catch (err) {
    detail("GET /health", err instanceof Error ? err.message : String(err));
    ok("API down — dry-run does not require it");
  }

  console.log(`\n${c.ok("DRY-RUN PASS")}  live: LIVE_E2E=1 npx tsx scripts/live_e2e_run.ts\n`);
  return 0;
}

async function liveRun(cfg: LiveConfig): Promise<number> {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Stage 4 live e2e — Devnet + real inference through proxy   ║
╚══════════════════════════════════════════════════════════════╝`);

  if (!existsSync(cfg.userWalletPath)) {
    throw new LiveE2EError(
      `user wallet missing: ${cfg.userWalletPath}. Run: npm run live:e2e:setup`,
      2,
    );
  }
  if (!existsSync(cfg.providerWalletPath)) {
    throw new LiveE2EError(
      `provider wallet missing: ${cfg.providerWalletPath}. Run: npm run live:e2e:setup`,
      2,
    );
  }
  if (cfg.provider === "openrouter" && !process.env.OPENROUTER_API_KEY && !process.env.KS_UPSTREAM_API_KEY) {
    throw new LiveE2EError(
      "YOU must set OPENROUTER_API_KEY (https://openrouter.ai/keys) or KS_LIVE_PROVIDER=ollama after `ollama serve`",
      2,
    );
  }

  const user = loadKeypair(cfg.userWalletPath);
  const providerKp = loadKeypair(cfg.providerWalletPath);
  const conn = new Connection(cfg.rpcUrl, "confirmed");
  // Fresh agent per run so ["agent_payment_stream", agent, owner] is unique
  // after a previous live open. Pin with KS_AGENT_PUBKEY to reuse.
  const agent = process.env.KS_AGENT_PUBKEY
    ? new PublicKey(process.env.KS_AGENT_PUBKEY)
    : Keypair.generate().publicKey;
  const [streamPda, bump] = deriveStreamPda(cfg.programId, agent, user.publicKey);
  const ownerAta = deriveAta(user.publicKey, cfg.usdcMint);
  const streamAta = deriveAta(streamPda, cfg.usdcMint);
  const vaultPda = cfg.vaultPda ? new PublicKey(cfg.vaultPda) : deriveVaultPda(cfg.programId, user.publicKey)[0];

  banner("0. wallets + RPC");
  detail("user", user.publicKey.toBase58());
  detail("agent", agent.toBase58());
  detail("provider/settler", providerKp.publicKey.toBase58());
  detail("stream PDA", `${streamPda.toBase58()} bump=${bump}`);
  detail("owner USDC ATA", ownerAta.toBase58());
  const sol = await conn.getBalance(user.publicKey);
  detail("user SOL", `${(sol / 1e9).toFixed(4)} SOL`);
  if (sol < 5_000_000) throw new LiveE2EError("user needs ≥ 0.005 SOL for fees", 2);
  let ownerAtaBefore = 0n;
  if (cfg.onchain) {
    const ataInfo = await conn.getAccountInfo(ownerAta);
    if (!ataInfo) throw new LiveE2EError(`owner USDC ATA missing (${ownerAta.toBase58()})`, 2);
    ownerAtaBefore = readTokenAmount(ataInfo.data);
    detail("owner USDC", `${ownerAtaBefore} micro-USDC`);
    if (ownerAtaBefore < BigInt(cfg.deposit)) {
      throw new LiveE2EError(`need ${cfg.deposit} micro-USDC, ATA has ${ownerAtaBefore}`, 2);
    }
  }
  ok("wallets ready");

  banner("0b. session token");
  const token = await walletLogin(cfg, user);
  ok("wallet-login (or KS_SESSION_TOKEN)");

  banner("0c. Universal Vault + agent grant");
  if (cfg.onchain) {
    const ensured = await ensureVaultAndGrant(conn, cfg, user, agent);
    if (!ensured.equals(vaultPda)) {
      throw new LiveE2EError(`ensured vault ${ensured.toBase58()} ≠ resolved ${vaultPda.toBase58()}`);
    }
  } else {
    ok("skipped vault/grant (LIVE_E2E_ONCHAIN=0)");
  }

  banner("1. initialize 5 USDC payment stream");
  const opened = await apiOk(
    cfg,
    "/mpp/streams",
    {
      method: "POST",
      body: JSON.stringify({
        agentPubkey: agent.toBase58(),
        agentName: "live-e2e",
        upstream: cfg.provider,
        ratePerTokenMicroUsdc: cfg.ratePerToken,
        ratePerCallMicroUsdc: cfg.ratePerCall,
        settlementIntervalSecs: 60,
        maxTotalMicroUsdc: cfg.deposit,
        streamPda: streamPda.toBase58(),
        streamUsdcAta: streamAta.toBase58(),
      }),
    },
    token,
  );
  const streamId = Number(opened.stream.id);
  detail("stream id", streamId);
  let openSig = "";
  if (cfg.onchain) {
    const existingStream = await conn.getAccountInfo(streamPda);
    if (existingStream && existingStream.data.subarray(0, 8).toString("utf8") === LIVE_DISC) {
      throw new LiveE2EError(
        `stream PDA ${streamPda.toBase58()} already initialized — close/withdraw or use a new USER/agent pair`,
      );
    }
    const built = await apiOk(
      cfg,
      `/mpp/streams/${streamId}/build-open-tx`,
      {
        method: "POST",
        body: JSON.stringify({
          ownerPubkey: user.publicKey.toBase58(),
          streamPda: streamPda.toBase58(),
          bump,
          usdcAta: ownerAta.toBase58(),
          maxTotalMicroUsdc: cfg.deposit,
          costPerUnitMicroUsdc: 1,
        }),
      },
      token,
    );
    if (built.streamUsdcAta !== streamAta.toBase58()) {
      throw new LiveE2EError(`server ATA ${built.streamUsdcAta} ≠ ${streamAta.toBase58()}`);
    }
    const ixs = [
      jsonToIx(built.prereqIxs[0]),
      jsonToIx(built.prereqIxs[1]),
      jsonToIx({ programId: built.programId, keys: built.keys, data: built.data }),
    ];
    openSig = await sendIxs(conn, user, ixs);
    detail("open tx", openSig);
    await apiOk(
      cfg,
      `/mpp/streams/${streamId}/record-tx`,
      {
        method: "POST",
        body: JSON.stringify({
          tx_signature: openSig,
          streamPda: streamPda.toBase58(),
          streamUsdcAta: streamAta.toBase58(),
        }),
      },
      token,
    );
    const acc = await conn.getAccountInfo(streamPda);
    if (!acc) throw new LiveE2EError("stream PDA missing after open");
    const disc = acc.data.subarray(0, 8).toString("utf8");
    if (disc !== LIVE_DISC) throw new LiveE2EError(`stream disc ${disc} ≠ ${LIVE_DISC}`);
    const funded = readTokenAmount((await conn.getAccountInfo(streamAta))!.data);
    if (funded !== BigInt(cfg.deposit)) throw new LiveE2EError(`stream ATA ${funded} ≠ deposit ${cfg.deposit}`);
    ok(`on-chain stream funded with ${funded} micro-USDC`);
  } else {
    ok("off-chain stream only (LIVE_E2E_ONCHAIN=0)");
  }

  banner("2–3. inference through proxy (SSE)");
  const proxyPath = PROVIDER_PATH[cfg.provider].path;
  const prompt = {
    model: cfg.model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: 32,
    messages: [
      {
        role: "user",
        content: "Reply with the single word pong and nothing else.",
      },
    ],
  };
  const infer = await api(
    cfg,
    proxyPath,
    {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
        "x-upstream-api-key": cfg.upstreamKey,
        "x-mpp-stream-id": String(streamId),
        "x-mpp-estimate-micro-usdc": "2000",
        "x-ks-est-tokens": "64",
        "x-idempotency-key": `live-e2e-${streamId}-${Date.now()}`,
      },
      body: JSON.stringify(prompt),
    },
    token,
  );
  detail("proxy status", infer.status);
  detail("x-ks-mpp-meter", infer.headers.get("x-ks-mpp-meter") ?? "(none)");
  detail("x-ks-stream-complete", infer.headers.get("x-ks-stream-complete") ?? "(none)");
  detail("x-ks-mpp-tokens", infer.headers.get("x-ks-mpp-tokens") ?? "(none)");
  if (infer.status < 200 || infer.status >= 300) {
    throw new LiveE2EError(`inference failed: ${infer.status} ${infer.text.slice(0, 240)}`);
  }
  const meter = infer.headers.get("x-ks-mpp-meter") ?? "";
  if (!meter.startsWith("held") && meter !== "idempotent_replay") {
    throw new LiveE2EError(`metering rejected: ${meter || "missing x-ks-mpp-meter"}`);
  }
  if (infer.headers.get("x-ks-stream-complete") === "0") {
    throw new LiveE2EError("upstream stream truncated; refusing to settle a partial generation");
  }
  const body = meteredBodyFromProxy(infer.body);
  const sseTokens = parseSseUsageTokens(body);
  const headerTokens = infer.headers.get("x-ks-mpp-tokens");
  const tokensUsed = headerTokens != null ? Number(headerTokens) : sseTokens;
  if (!tokensUsed || tokensUsed <= 0) {
    throw new LiveE2EError("proxy billed 0 tokens — provider must return usage on the SSE stream");
  }
  if (sseTokens != null && headerTokens != null && Number(headerTokens) !== sseTokens) {
    throw new LiveE2EError(`token mismatch header=${headerTokens} sse=${sseTokens}`);
  }
  ok(`continuous metering: ${tokensUsed} tokens (${meter})`);

  banner("4. sha256(artifact) + capture → mpp_settle");
  let artifact = infer.headers.get("x-ks-mpp-artifact") ?? "";
  if (!artifact) {
    artifact = artifactHashHex({
      streamId,
      upstream: cfg.provider,
      statusCode: infer.status,
      body,
      calls: 1,
      tokens: tokensUsed,
    });
  }
  const signature = signCapture(token, artifact);
  const expected = expectedDebitMicro(tokensUsed, cfg.ratePerToken, 0, cfg.ratePerCall);
  const ownerSignature = signSettlementBinding(user, streamPda, 1, expected, artifact);
  detail("artifact", artifact);
  const captured = await apiOk(
    cfg,
    `/mpp/streams/${streamId}/capture`,
    {
      method: "POST",
      body: JSON.stringify({
        artifactHash: artifact,
        signature,
        ownerPubkey: user.publicKey.toBase58(),
        ownerSignature,
      }),
    },
    token,
  );
  const settled = Number(captured.stream.just_settled_micro_usdc ?? captured.stream.settled_micro_usdc);
  detail("settled", `${settled} micro-USDC`);
  detail("expected", `${expected} = ${tokensUsed} × ${cfg.ratePerToken}`);
  if (settled !== expected) {
    throw new LiveE2EError(`settled ${settled} ≠ tokens*price ${expected}`);
  }
  ok("capture MAC verified; ledger debit matches token × price");

  banner("5. on-chain balance == token calculation");
  if (cfg.onchain) {
    const streamAcc = await conn.getAccountInfo(streamPda);
    if (!streamAcc) throw new LiveE2EError("stream PDA vanished after settle");
    const spent = readSpentTotal(streamAcc.data);
    const ataLeft = readTokenAmount((await conn.getAccountInfo(streamAta))!.data);
    detail("spent_total", spent.toString());
    detail("stream ATA", ataLeft.toString());
    if (spent !== BigInt(expected)) {
      throw new LiveE2EError(`on-chain spent ${spent} ≠ ${expected}`);
    }
    if (ataLeft !== BigInt(cfg.deposit) - BigInt(expected)) {
      throw new LiveE2EError(`stream ATA ${ataLeft} ≠ deposit-settled ${BigInt(cfg.deposit) - BigInt(expected)}`);
    }
    ok("Devnet spent_total matches tokens_used * price_per_token");
  } else {
    ok("skipped chain assert (LIVE_E2E_ONCHAIN=0)");
  }

  banner("6. close stream; remaining USDC to client");
  const closed = await apiOk(cfg, `/mpp/streams/${streamId}/close`, { method: "POST" }, token);
  if (closed.stream.status !== "closed") throw new LiveE2EError(`stream status ${closed.stream.status} ≠ closed`);
  const remaining = cfg.deposit - expected;
  detail("remaining", `${remaining} micro-USDC`);
  let refunded = false;
  if (cfg.onchain && remaining > 0) {
    const revokeIx = new TransactionInstruction({
      programId: cfg.programId,
      keys: [
        { pubkey: user.publicKey, isSigner: true, isWritable: false },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
      ],
      data: Buffer.concat([Buffer.from([REVOKE_DISC]), agent.toBuffer()]),
    });
    try {
      const revokeSig = await sendIxs(conn, user, [revokeIx]);
      detail("revoke tx", revokeSig);
      const withdraw = await apiOk(
        cfg,
        `/mpp/streams/${streamId}/build-withdraw-tx`,
        {
          method: "POST",
          body: JSON.stringify({
            ownerPubkey: user.publicKey.toBase58(),
            streamPda: streamPda.toBase58(),
            streamAta: streamAta.toBase58(),
            ownerAta: ownerAta.toBase58(),
            withdrawAmountMicroUsdc: remaining,
          }),
        },
        token,
      );
      const withdrawSig = await sendIxs(conn, user, [jsonToIx(withdraw)]);
      detail("withdraw tx", withdrawSig);
      const ownerAfter = readTokenAmount((await conn.getAccountInfo(ownerAta))!.data);
      const expectOwner = ownerAtaBefore - BigInt(expected);
      if (ownerAfter !== expectOwner) {
        throw new LiveE2EError(`owner ATA ${ownerAfter} ≠ pre-open minus settled ${expectOwner}`);
      }
      refunded = true;
      ok("remaining USDC returned to client wallet");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const ataLeft = readTokenAmount((await conn.getAccountInfo(streamAta))!.data);
      if (ataLeft !== BigInt(remaining)) {
        throw new LiveE2EError(`refund failed (${msg}); stream ATA ${ataLeft} ≠ remaining ${remaining}`);
      }
      if (!cfg.allowEscrowResidual) throw new LiveE2EError(`withdraw failed: ${msg}`);
      ok(`remaining ${remaining} still in client-owned stream ATA (grant/vault not withdrawn): ${msg.slice(0, 160)}`);
    }
  } else if (!cfg.onchain) {
    ok(`off-chain close; residual ${remaining} released from holds`);
  } else {
    ok("deposit fully consumed; nothing to refund");
  }

  console.log(`
${c.ok("╔══════════════════════════════════════════════════════════════╗")}
${c.ok("║  LIVE-E2E PASS — inference metered and settled on Devnet    ║")}
${c.ok("╚══════════════════════════════════════════════════════════════╝")}

  stream id:   ${streamId}
  tokens:      ${tokensUsed}
  settled:     ${expected} micro-USDC
  remaining:   ${remaining} micro-USDC ${refunded ? "(withdrawn)" : "(escrow / closed)"}
  open tx:     ${openSig || "(off-chain)"}
  explorer:    ${openSig ? `https://explorer.solana.com/tx/${openSig}?cluster=devnet` : "n/a"}
`);
  return 0;
}

export async function runLiveE2E(argv = process.argv.slice(2)): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`Usage: npx tsx scripts/live_e2e_run.ts [--dry-run]

Env:
  LIVE_E2E=1                 actually hit Devnet + the inference provider
  LIVE_E2E_ONCHAIN=0         live proxy/capture only (stub settler)
  KS_LIVE_PROVIDER           openrouter | ollama | vllm
  KS_LIVE_MODEL              provider model id
  KS_USER_WALLET             client keypair JSON
  KS_PROVIDER_WALLET         settler keypair JSON
  OPENROUTER_API_KEY         X-Upstream-API-Key for OpenRouter
  KS_SESSION_TOKEN           skip wallet-login
  KS_API_BASE                default http://127.0.0.1:8000
`);
    return 0;
  }
  const cfg = resolveConfig(argv);
  return cfg.dryRun ? dryRun(cfg) : liveRun(cfg);
}

const invoked =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  runLiveE2E().then(
    (code) => process.exit(code),
    (err) => {
      const code = err instanceof LiveE2EError ? err.exitCode : 1;
      console.error(`\n${c.err("LIVE-E2E FAIL")}: ${err instanceof Error ? err.message : err}`);
      if (code === 2) {
        console.error(`
This agent cannot create an OpenRouter key or Circle USDC.
  1. npm run live:e2e:setup
  2. export OPENROUTER_API_KEY=sk-or-...   OR   KS_LIVE_PROVIDER=ollama
  3. Fund the USER pubkey with ≥0.01 SOL + 5 USDC (https://faucet.circle.com)
  4. set -a && source .keyshield-devnet/live-e2e.env && set +a
  5. LIVE_E2E=1 npm run live:e2e
`);
      }
      process.exit(code);
    },
  );
}
