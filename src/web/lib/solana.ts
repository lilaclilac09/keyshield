import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  type Connection,
} from '@solana/web3.js';

export const APS_SEED = 'agent_payment_stream';
export type Cluster = 'devnet' | 'mainnet-beta';
const DEFAULT_CLUSTER: Cluster = 'devnet';

function b64decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

export function getUsdcMint(): PublicKey {
  return new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');
}

export const DEVNET_PROGRAM_ID = '41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j';

export function getKeyshieldProgramId(): PublicKey | null {
  const raw = (typeof process !== 'undefined'
    && (process.env as Record<string, string>)?.['KEYSHIELD_PROGRAM_ID']) || DEVNET_PROGRAM_ID;
  if (!raw) return null;
  try { return new PublicKey(raw); } catch { return null; }
}

export function deriveStreamPda(agentPubkey: PublicKey, ownerPubkey: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(APS_SEED), agentPubkey.toBuffer(), ownerPubkey.toBuffer()], programId,
  );
}

export interface BuildTxResponse {
  programId: string;
  keys: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string;
  prereqIxs?: BuildTxResponse[];
  streamUsdcAta?: string;
}

export function instructionFromResponse(resp: BuildTxResponse): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(resp.programId),
    keys: resp.keys.map(k => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    // TransactionInstruction#data wants a Node Buffer; b64decode returns a
    // browser-safe Uint8Array. Buffer.from(Uint8Array) is a noop in Node and
    // a polyfill in browser builds (Vite ships buffer polyfill via
    // wallet-adapter-base), and matches the runtime shape Solana expects.
    data: Buffer.from(b64decode(resp.data)),
  });
}

export function buildTxFromResponse(resp: BuildTxResponse): Transaction {
  return new Transaction().add(instructionFromResponse(resp));
}

/** Wallet must prepend ATA-create + fund before ix 24, else later settle hits OwnerMismatch. */
export function assembleOpenStreamTx(resp: BuildTxResponse): Transaction {
  const tx = new Transaction();
  for (const ix of resp.prereqIxs ?? []) {
    tx.add(instructionFromResponse(ix));
  }
  tx.add(instructionFromResponse(resp));
  return tx;
}

export async function signAndConfirmTx(
  tx: Transaction, connection: Connection, sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>,
): Promise<string> {
  const sig = await sendTransaction(tx, connection);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
  return sig;
}

export function explorerTxUrl(sig: string, cluster: Cluster = DEFAULT_CLUSTER): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=${cluster}`;
}

export function deriveAta(owner: PublicKey, mint: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}
