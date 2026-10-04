#!/usr/bin/env npx tsx
/**
 * Generate gitignored Devnet keypairs and print what YOU must supply
 * for `LIVE_E2E=1`. This agent cannot create an OpenRouter key or
 * Circle USDC. Wallets land in `.keyshield-devnet/` (gitignored).
 *
 *   npm run live:e2e:setup
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  USDC_MINT_DEVNET,
  deriveAta,
  deriveVaultPda,
  PROGRAM_ID_DEFAULT,
} from "./live_e2e_run.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, ".keyshield-devnet");
const USER_PATH = join(CACHE, "user-devnet.json");
const SETTLER_PATH = join(CACHE, "mpp-settler-devnet.json");
const ENV_PATH = join(CACHE, "live-e2e.env");
const RPC = process.env.KS_SOLANA_RPC_URL || "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey(process.env.KS_KEYSHIELD_PROGRAM_ID || PROGRAM_ID_DEFAULT);
const USDC = new PublicKey(process.env.KS_USDC_MINT || USDC_MINT_DEVNET);

function loadOrCreate(path: string, label: string): Keypair {
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    const kp = Keypair.fromSecretKey(Uint8Array.from(raw));
    console.log(`  reuse ${label}  ${kp.publicKey.toBase58()}  (${path})`);
    return kp;
  }
  const kp = Keypair.generate();
  writeFileSync(path, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  console.log(`  wrote ${label}  ${kp.publicKey.toBase58()}  (${path})`);
  return kp;
}

async function tryAirdrop(conn: Connection, pk: PublicKey, label: string): Promise<void> {
  const bal = await conn.getBalance(pk);
  console.log(`  ${label} SOL  ${(bal / 1e9).toFixed(4)}`);
  if (bal >= 10_000_000) return;
  try {
    const sig = await conn.requestAirdrop(pk, 1_000_000_000);
    await conn.confirmTransaction(sig, "confirmed");
    console.log(`  airdrop ${label}  ${sig}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  airdrop ${label} skipped (${msg.slice(0, 120)})`);
    console.log("    SOL faucet: https://faucet.solana.com");
  }
}

export function operatorChecklist(args: {
  user: string;
  settler: string;
  userAta: string;
  settlerAta: string;
}): string {
  return `
YOU must do these — this environment cannot:

1. Inference key (pick one)
   OpenRouter: https://openrouter.ai/keys
     export OPENROUTER_API_KEY=sk-or-...
   or local Ollama (no cloud key):
     ollama serve && ollama pull llama3.2
     export KS_LIVE_PROVIDER=ollama

2. Fund Devnet wallets
   USER    ${args.user}
     ≥ 0.01 SOL  +  ≥ 5 USDC (5_000_000 micro)
   SETTLER ${args.settler}
     ≥ 0.01 SOL
   USER USDC ATA     ${args.userAta}
   SETTLER USDC ATA  ${args.settlerAta}
   USDC mint ${USDC_MINT_DEVNET}
   Circle faucet: https://faucet.circle.com  (devnet, send to USER)

3. Start the API with the env file, then run live:
     set -a && source .keyshield-devnet/live-e2e.env && set +a
     export OPENROUTER_API_KEY=...    # or KS_LIVE_PROVIDER=ollama
     npm run dev:api
     LIVE_E2E=1 npm run live:e2e
`;
}

async function main(): Promise<void> {
  mkdirSync(CACHE, { recursive: true });
  console.log("▶ Stage 4 setup — local Devnet keypairs (gitignored)");
  const user = loadOrCreate(USER_PATH, "user");
  const settler = loadOrCreate(SETTLER_PATH, "settler");
  const userAta = deriveAta(user.publicKey, USDC);
  const settlerAta = deriveAta(settler.publicKey, USDC);
  const vaultPda = deriveVaultPda(PROGRAM_ID, user.publicKey)[0];
  const conn = new Connection(RPC, "confirmed");
  await tryAirdrop(conn, user.publicKey, "user");
  await tryAirdrop(conn, settler.publicKey, "settler");

  const settlerSecretB58 = bs58.encode(Buffer.from(settler.secretKey));
  const env = [
    `export KS_USER_WALLET=${USER_PATH}`,
    `export KS_PROVIDER_WALLET=${SETTLER_PATH}`,
    `export KS_MPP_SETTLER_KEY=${settlerSecretB58}`,
    `export KS_MPP_SETTLER_PUBKEY=${settler.publicKey.toBase58()}`,
    `export KS_PLATFORM_USDC_ATA=${settlerAta.toBase58()}`,
    `export KS_VAULT_PDA=${vaultPda.toBase58()}`,
    `export KS_KEYSHIELD_PROGRAM_ID=${PROGRAM_ID.toBase58()}`,
    `export KS_USDC_MINT=${USDC.toBase58()}`,
    `export KS_SOLANA_RPC_URL=${RPC}`,
    `export KS_API_BASE=http://127.0.0.1:8001`,
    `# export OPENROUTER_API_KEY=   # paste from https://openrouter.ai/keys`,
    `# export KS_LIVE_PROVIDER=ollama`,
    "",
  ].join("\n");
  writeFileSync(ENV_PATH, env, { mode: 0o600 });
  console.log(`  wrote ${ENV_PATH}`);
  console.log(operatorChecklist({
    user: user.publicKey.toBase58(),
    settler: settler.publicKey.toBase58(),
    userAta: userAta.toBase58(),
    settlerAta: settlerAta.toBase58(),
  }));
}

const invoked =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
