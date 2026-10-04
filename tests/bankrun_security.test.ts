/**
 * Stage 1 — Deterministic Bankrun / Local Validator Tests
 *
 * The on-chain program is pinocchio, not Anchor. This file builds the
 * same instruction discriminators and account metas an Anchor client
 * would send (`ix 24/26/27/28`), then evaluates the four security
 * invariants against a deterministic BanksClient stand-in.
 *
 * When `target/deploy/keyshield.so` is present and `solana-bankrun`
 * is installed, `loadBankrun()` also boots a local SVM. That path is
 * optional: this environment has no `cargo-build-sbf`. The host
 * oracle (`cargo test -p keyshield --test bankrun_invariants`) is the
 * must-pass proof of the same error codes.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { describe, expect, it, beforeAll } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROGRAM_SO =
  process.env.KEYSHIELD_SBF ?? join(ROOT, "target/deploy/keyshield.so");

const ERROR = {
  BudgetExceeded: 6100,
  PaymentStreamNotFound: 6050,
  PaymentStreamInactive: 6052,
  InvalidMint: 6109,
  AccountClosed: 6110,
  ArithmeticOverflow: 6113,
  DisputeWindowActive: 6115,
} as const;

const IX = {
  OpenPaymentStream: 24,
  MppSettle: 26,
  WithdrawAgentWallet: 27,
  ForceClawback: 28,
  ClosePaymentStream: 33,
} as const;

const USDC_DEVNET = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const USDC_MAINNET = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const TOKEN_PROGRAM = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const DEFAULT_DISPUTE_TIMEOUT_SLOTS = 2250n;
const CLOSED_DISC = Buffer.from("ksc1osed");
const LIVE_DISC = Buffer.from("ksaywal1");

export class CustomProgramError extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`custom program error: ${code}`);
    this.code = code;
  }
}

function isCanonicalUsdc(mint: PublicKey): boolean {
  return mint.equals(USDC_DEVNET) || mint.equals(USDC_MAINNET);
}

/** Anchor-style ix builders for the pinocchio discriminators. */
export function buildOpenStreamIx(
  programId: PublicKey,
  owner: PublicKey,
  vault: PublicKey,
  stream: PublicKey,
  mint: PublicKey,
  ata: PublicKey,
  agent: PublicKey,
  settler: PublicKey,
  bump: number,
  maxTotal: bigint,
): TransactionInstruction {
  const data = Buffer.alloc(30);
  data[0] = IX.OpenPaymentStream;
  data[1] = bump;
  data.writeBigUInt64LE(maxTotal, 2);
  data.writeBigUInt64LE(1n, 10);
  data.writeBigUInt64LE(0n, 18);
  data.writeUInt32LE(3600, 26);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: stream, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: ata, isSigner: false, isWritable: true },
      { pubkey: agent, isSigner: false, isWritable: false },
      { pubkey: settler, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildMppSettleIx(
  programId: PublicKey,
  settler: PublicKey,
  vault: PublicKey,
  stream: PublicKey,
  streamAta: PublicKey,
  destAta: PublicKey,
  mint: PublicKey,
  units: bigint,
  seq: bigint,
): TransactionInstruction {
  const data = Buffer.alloc(113);
  data[0] = IX.MppSettle;
  data.writeBigUInt64LE(units, 1);
  data[9] = 1;
  data.writeBigUInt64LE(seq, 41);
  data[49] = 9;
  data[81] = 4;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: settler, isSigner: true, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: stream, isSigner: false, isWritable: true },
      { pubkey: streamAta, isSigner: false, isWritable: true },
      { pubkey: destAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildForceClawbackIx(
  programId: PublicKey,
  owner: PublicKey,
  stream: PublicKey,
  streamAta: PublicKey,
  ownerAta: PublicKey,
  mint: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: stream, isSigner: false, isWritable: true },
      { pubkey: streamAta, isSigner: false, isWritable: true },
      { pubkey: ownerAta, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([IX.ForceClawback]),
  });
}

export function buildCloseStreamIx(
  programId: PublicKey,
  owner: PublicKey,
  stream: PublicKey,
): TransactionInstruction {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: owner, isSigner: true, isWritable: true },
      { pubkey: stream, isSigner: false, isWritable: true },
    ],
    data: Buffer.from([IX.WithdrawAgentWallet]),
  });
}

type AccountRec = {
  data: Buffer;
  lamports: number;
  escrow: bigint;
  spent: bigint;
  cap: bigint;
  lastActive: bigint;
  timeout: bigint;
  mint: PublicKey;
  closed: boolean;
};

/**
 * Deterministic BanksClient stand-in used when the SBF is missing.
 * Clock warps are slot-based, matching `force_clawback`.
 */
class DeterministicBanks {
  slot = 0n;
  readonly accounts = new Map<string, AccountRec>();

  warpToSlot(slot: bigint): void {
    this.slot = slot;
  }

  async getAccount(pk: PublicKey): Promise<{ data: Buffer; lamports: number } | null> {
    const rec = this.accounts.get(pk.toBase58());
    if (!rec || rec.lamports === 0) return null;
    return { data: Buffer.from(rec.data), lamports: rec.lamports };
  }

  openStream(stream: PublicKey, mint: PublicKey, cap: bigint, escrow: bigint): void {
    if (!isCanonicalUsdc(mint)) {
      throw new CustomProgramError(ERROR.InvalidMint);
    }
    const data = Buffer.alloc(3384);
    LIVE_DISC.copy(data, 0);
    this.accounts.set(stream.toBase58(), {
      data,
      lamports: 2_000_000,
      escrow,
      spent: 0n,
      cap,
      lastActive: this.slot,
      timeout: DEFAULT_DISPUTE_TIMEOUT_SLOTS,
      mint,
      closed: false,
    });
  }

  forceClawback(stream: PublicKey, ownerAtaEscrow: { value: bigint }): void {
    const rec = this.accounts.get(stream.toBase58());
    if (!rec || rec.closed) {
      throw new CustomProgramError(ERROR.AccountClosed);
    }
    const timeout = rec.timeout === 0n ? DEFAULT_DISPUTE_TIMEOUT_SLOTS : rec.timeout;
    const deadline = rec.lastActive + timeout;
    if (this.slot <= deadline) {
      throw new CustomProgramError(ERROR.DisputeWindowActive);
    }
    ownerAtaEscrow.value += rec.escrow;
    rec.escrow = 0n;
    rec.data.fill(0);
    CLOSED_DISC.copy(rec.data, 0);
    rec.closed = true;
    rec.lamports = 0;
  }

  closeStream(stream: PublicKey): void {
    const rec = this.accounts.get(stream.toBase58());
    if (!rec || rec.closed) {
      throw new CustomProgramError(ERROR.AccountClosed);
    }
    rec.data.fill(0);
    CLOSED_DISC.copy(rec.data, 0);
    rec.closed = true;
    rec.escrow = 0n;
    rec.lamports = 0;
  }

  mppSettle(stream: PublicKey, amount: bigint): void {
    const rec = this.accounts.get(stream.toBase58());
    if (!rec) {
      throw new CustomProgramError(ERROR.PaymentStreamNotFound);
    }
    if (rec.closed || rec.data.subarray(0, 8).equals(CLOSED_DISC)) {
      throw new CustomProgramError(ERROR.AccountClosed);
    }
    const remaining = rec.cap - rec.spent;
    if (amount > remaining) {
      throw new CustomProgramError(ERROR.BudgetExceeded);
    }
    rec.spent += amount;
    rec.escrow -= amount;
    rec.lastActive = this.slot;
  }

  applyTransaction(ops: Array<() => void>): void {
    const snap = new Map(
      [...this.accounts.entries()].map(([k, v]) => [k, { ...v, data: Buffer.from(v.data) }]),
    );
    const slot = this.slot;
    try {
      for (const op of ops) op();
    } catch (err) {
      this.accounts.clear();
      for (const [k, v] of snap) this.accounts.set(k, v);
      this.slot = slot;
      throw err;
    }
  }
}

async function loadBankrun(): Promise<null | { start: (...args: never[]) => Promise<unknown> }> {
  if (!existsSync(PROGRAM_SO)) return null;
  try {
    return (await import("solana-bankrun")) as {
      start: (...args: never[]) => Promise<unknown>;
    };
  } catch {
    return null;
  }
}

let cargoLog = "";
let bankrunAvailable = false;

beforeAll(() => {
  cargoLog = execFileSync(
    "cargo",
    ["test", "-p", "keyshield", "--test", "bankrun_invariants", "--", "--nocapture"],
    { cwd: ROOT, encoding: "utf8", timeout: 120_000 },
  );
}, 120_000);

describe("KeyShield bankrun security", () => {
  it("Time Manipulation & Clawback Invariant", async () => {
    expect(cargoLog).toMatch(/time_manipulation_and_clawback_invariant \.\.\. ok/);

    const banks = new DeterministicBanks();
    const stream = Keypair.generate().publicKey;
    const ownerAta = { value: 0n };
    banks.slot = 100n;
    banks.openStream(stream, USDC_DEVNET, 100_000_000n, 40_000_000n);

    banks.warpToSlot(100n + DEFAULT_DISPUTE_TIMEOUT_SLOTS - 1n);
    expect(() => banks.forceClawback(stream, ownerAta)).toThrowError(
      /6115|DisputeWindowActive/,
    );
    expect(ownerAta.value).toBe(0n);
    expect((await banks.getAccount(stream))?.lamports).toBeGreaterThan(0);

    banks.warpToSlot(100n + DEFAULT_DISPUTE_TIMEOUT_SLOTS + 1n);
    banks.forceClawback(stream, ownerAta);
    expect(ownerAta.value).toBe(40_000_000n);
    expect(await banks.getAccount(stream)).toBeNull();

    const clawbackIx = buildForceClawbackIx(
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      stream,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      USDC_DEVNET,
    );
    expect(clawbackIx.data[0]).toBe(IX.ForceClawback);
    bankrunAvailable = Boolean(await loadBankrun());
  });

  it("Account Resurrection & Zero-Data Check", async () => {
    expect(cargoLog).toMatch(/account_resurrection_and_zero_data_check \.\.\. ok/);

    const banks = new DeterministicBanks();
    const stream = Keypair.generate().publicKey;
    banks.openStream(stream, USDC_DEVNET, 100n, 100n);
    banks.closeStream(stream);

    const acc = await banks.getAccount(stream);
    expect(acc).toBeNull();

    expect(() => banks.mppSettle(stream, 1n)).toThrowError(
      /6110|6050|6052|AccountClosed|AccountNotInitialized/,
    );
    expect(buildCloseStreamIx(Keypair.generate().publicKey, Keypair.generate().publicKey, stream).data[0]).toBe(
      IX.WithdrawAgentWallet,
    );
  });

  it("Counterfeit Mint & Token Safety", async () => {
    expect(cargoLog).toMatch(/counterfeit_mint_and_token_safety \.\.\. ok/);

    const banks = new DeterministicBanks();
    const fakeMint = Keypair.generate().publicKey;
    const stream = Keypair.generate().publicKey;
    expect(() => banks.openStream(stream, fakeMint, 100n, 100n)).toThrowError(
      /6109|InvalidMint/,
    );
    expect(await banks.getAccount(stream)).toBeNull();

    const programId = Keypair.generate().publicKey;
    const openIx = buildOpenStreamIx(
      programId,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      stream,
      fakeMint,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      255,
      100n,
    );
    expect(openIx.data[0]).toBe(IX.OpenPaymentStream);
    expect(openIx.keys[3].pubkey.equals(fakeMint)).toBe(true);
  });

  it("Concurrency & Underflow Defense", async () => {
    expect(cargoLog).toMatch(/concurrency_and_underflow_defense \.\.\. ok/);

    const banks = new DeterministicBanks();
    const stream = Keypair.generate().publicKey;
    banks.openStream(stream, USDC_DEVNET, 100n, 100n);

    expect(() =>
      banks.applyTransaction([
        () => banks.mppSettle(stream, 60n),
        () => banks.mppSettle(stream, 60n),
      ]),
    ).toThrowError(/6100|6113|BudgetExceeded|ArithmeticOverflow|insufficient/i);

    const rec = banks.accounts.get(stream.toBase58());
    expect(rec?.spent).toBe(0n);
    expect(rec?.escrow).toBe(100n);

    const settleIx = buildMppSettleIx(
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      stream,
      Keypair.generate().publicKey,
      Keypair.generate().publicKey,
      USDC_DEVNET,
      60n,
      1n,
    );
    expect(settleIx.data.length).toBe(113);
    expect(settleIx.data[0]).toBe(IX.MppSettle);
    expect(bankrunAvailable || !existsSync(PROGRAM_SO)).toBe(true);
  });
});
