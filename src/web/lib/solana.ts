/**
 * Solana helpers for the KeyShield wallet sign-off UI.
 *
 * Spec 10 Phase 10.5 (Beta — wallet sign-off): the server returns the
 * unsigned ix payload from `/mpp/streams/{id}/build-{open,withdraw}-tx`
 * but cannot derive the PDA that `open_payment_stream` (#24) creates —
 * the bump must come from the SIGNER side or Solana rejects the ix.
 * We compute it client-side via `findProgramAddressSync` and pass
 * `streamPda` + `bump` back to the server in the request body.
 *
 * PDA seeds — see programs/keyshield/src/instructions/open_stream.rs:38
 * (`pub const APS_SEED: &[u8] = b"agent_payment_stream";`):
 *   ["agent_payment_stream", agent_grant_pubkey, owner_pubkey]
 *
 * Helpers also include the explorer URL builder so `ActivitySection`
 * doesn't hardcode the cluster string in three places.
 */

import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  type Connection,
} from '@solana/web3.js';

/** Seed prefix for `open_payment_stream` PDAs.
 *  Matches `APS_SEED` in programs/keyshield/src/instructions/open_stream.rs:38. */
export const APS_SEED = 'agent_payment_stream';

/** Solana cluster the demo targets — devnet for now per ROADMAP §6a. */
export type Cluster = 'devnet' | 'mainnet-beta';
const DEFAULT_CLUSTER: Cluster = 'devnet';

/** Base64 decode → Uint8Array (browser-safe, no `buffer` dep needed). */
function b64decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** KeyShield on-chain program id.
 *
 *  Read from `KEYSHIELD_PROGRAM_ID` (vite.config.ts pipes it through
 *  `process.env`). Returns `null` when the env var isn't set — caller
 *  is expected to disable the wallet sign-off UI in that case (server
 *  also returns 503 from /build-*-tx so the failure is double-gated). */
export function getKeyshieldProgramId(): PublicKey | null {
  const raw = (typeof process !== 'undefined'
    && (process.env as Record<string, string>)?.['KEYSHIELD_PROGRAM_ID'])
    || '';
  if (!raw) return null;
  try {
    return new PublicKey(raw);
  } catch {
    return null;
  }
}

/** Derive the AgentPaymentStream PDA from agent + owner pubkeys.
 *
 *  Returns `[pda, bump]`. `bump` is the 1-byte canonical bump that the
 *  server will pack into byte 1 of the ix data (after the discriminator
 *  is stripped) — see open_stream.rs:89.
 */
export function deriveStreamPda(
  agentPubkey: PublicKey,
  ownerPubkey: PublicKey,
  programId:   PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(APS_SEED),
      agentPubkey.toBuffer(),
      ownerPubkey.toBuffer(),
    ],
    programId,
  );
}

/** Wire shape the server returns from `/mpp/streams/{id}/build-*-tx`.
 *  Matches `BuildTxResponse` in v2-mvp/src/server.py:1973. */
export interface BuildTxResponse {
  programId: string;
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string;  // base64-encoded ix payload (discriminator + body)
}

/** Wrap the server's BuildTxResponse into a `Transaction` ready for
 *  wallet adapter `signAndSendTransaction`.
 *
 *  This is intentionally one-line-per-step so reviewers can see the
 *  base64→bytes hop and the AccountMeta translation match the server's
 *  `_ix_to_response` byte-for-byte (server.py:1979). */
export function buildTxFromResponse(resp: BuildTxResponse): Transaction {
  const ix = new TransactionInstruction({
    programId: new PublicKey(resp.programId),
    keys: resp.keys.map(k => ({
      pubkey:     new PublicKey(k.pubkey),
      isSigner:   k.isSigner,
      isWritable: k.isWritable,
    })),
    data: b64decode(resp.data),
  });
  return new Transaction().add(ix);
}

/** Sign + send + confirm a built Transaction via the wallet adapter.
 *
 *  Returns the base58 tx signature once the cluster confirms the tx at
 *  the `'confirmed'` commitment. Caller posts the sig to
 *  `/mpp/streams/{id}/record-tx` for UI persistence. */
export async function signAndConfirmTx(
  tx:              Transaction,
  connection:      Connection,
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>,
): Promise<string> {
  const sig = await sendTransaction(tx, connection);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction(
    { signature: sig, ...latest },
    'confirmed',
  );
  return sig;
}

/** Solana explorer URL for a tx signature on the configured cluster. */
export function explorerTxUrl(sig: string, cluster: Cluster = DEFAULT_CLUSTER): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
}

// ── SPL ATA derivation (no @solana/spl-token dep) ───────────────────────────
//
// We avoid pulling in @solana/spl-token because we only need the ATA
// pubkey (not a transfer/mint helper) and the spl-token package adds
// ~80kb to the wallet sign-off bundle. The derivation rule below is the
// canonical one — see https://spl.solana.com/associated-token-account.

/** SPL Token program id (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA). */
export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
);

/** SPL Associated Token Account program id. */
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);

/** Devnet USDC mint (Circle). Override via `KEYSHIELD_USDC_MINT` env when
 *  pointing at a fork or a custom faucet mint. */
export function getUsdcMint(): PublicKey {
  const raw = (typeof process !== 'undefined'
    && (process.env as Record<string, string>)?.['KEYSHIELD_USDC_MINT'])
    || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';  // devnet USDC
  return new PublicKey(raw);
}

/** Derive an Associated Token Account pubkey from owner + mint.
 *  Uses the canonical SPL formula so we don't need @solana/spl-token. */
export function deriveAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}
