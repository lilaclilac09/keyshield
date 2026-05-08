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

export function getKeyshieldProgramId(): PublicKey | null {
  const raw = (typeof process !== 'undefined'
    && (process.env as Record<string, string>)?.['KEYSHIELD_PROGRAM_ID']) || '';
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
}

export function buildTxFromResponse(resp: BuildTxResponse): Transaction {
  const ix = new TransactionInstruction({
    programId: new PublicKey(resp.programId),
    keys: resp.keys.map(k => ({
      pubkey: new PublicKey(k.pubkey),
      isSigner: k.isSigner,
      isWritable: k.isWritable,
    })),
    data: b64decode(resp.data),
  });
  return new Transaction().add(ix);
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
