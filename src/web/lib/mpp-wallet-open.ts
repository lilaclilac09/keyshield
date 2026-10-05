/**
 * Activity "Open stream → wallet sign" path.
 * Vault create → enable payments → grant → off-chain row →
 * build-open-tx (prereqIxs + open) → record-tx with PDA/ATA.
 */
import { Connection, PublicKey, clusterApiUrl, type Transaction } from '@solana/web3.js';
import {
  buildOpenStreamTx,
  buildVaultCreateTx,
  buildVaultEnablePaymentsTx,
  buildVaultGrantTx,
  openMppStreamRow,
  recordMppTxSignature,
} from './api';
import {
  buildTxFromResponse,
  deriveAta,
  deriveStreamPda,
  getUsdcMint,
  signAndConfirmTx,
  type BuildTxResponse,
} from './solana';

function alreadyOnChain(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /already in use|already been processed|0x0\b|custom program error: 0/i.test(msg);
}

async function sendIx(
  resp: BuildTxResponse,
  connection: Connection,
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>,
): Promise<string | null> {
  const tx = buildTxFromResponse(resp);
  try {
    return await signAndConfirmTx(tx, connection, sendTransaction);
  } catch (err) {
    if (alreadyOnChain(err)) return null;
    throw err;
  }
}

export async function openStreamWithWallet(opts: {
  ownerPubkey: string;
  programId: string;
  agentPubkey: string;
  agentName?: string;
  upstream: string;
  maxTotalMicroUsdc: number;
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>;
  onStep?: (label: string) => void;
}): Promise<{ streamId: number; txSignature: string; streamPda: string; streamUsdcAta: string }> {
  const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
  const owner = new PublicKey(opts.ownerPubkey);
  const agent = new PublicKey(opts.agentPubkey);
  const program = new PublicKey(opts.programId);
  const [streamPda, bump] = deriveStreamPda(agent, owner, program);
  const ownerAta = deriveAta(owner, getUsdcMint());

  opts.onStep?.('vault');
  await sendIx(await buildVaultCreateTx(opts.ownerPubkey), connection, opts.sendTransaction);
  opts.onStep?.('enable-payments');
  await sendIx(await buildVaultEnablePaymentsTx(opts.ownerPubkey), connection, opts.sendTransaction);
  opts.onStep?.('grant');
  await sendIx(
    await buildVaultGrantTx(opts.ownerPubkey, opts.agentPubkey, opts.maxTotalMicroUsdc),
    connection,
    opts.sendTransaction,
  );

  opts.onStep?.('row');
  const opened = await openMppStreamRow({
    agentPubkey: opts.agentPubkey,
    agentName: opts.agentName,
    upstream: opts.upstream,
    maxTotalMicroUsdc: opts.maxTotalMicroUsdc,
    ratePerTokenMicroUsdc: 1,
    ratePerCallMicroUsdc: 0,
  });
  const streamId = opened.stream.id;

  opts.onStep?.('open');
  const built = await buildOpenStreamTx(streamId, {
    ownerPubkey: opts.ownerPubkey,
    streamPda: streamPda.toBase58(),
    bump,
    usdcAta: ownerAta.toBase58(),
    maxTotalMicroUsdc: opts.maxTotalMicroUsdc,
  });
  if (!built.prereqIxs || built.prereqIxs.length < 2) {
    throw new Error('build-open-tx missing prereqIxs (create ATA + fund)');
  }
  const streamUsdcAta = built.streamUsdcAta ?? deriveAta(streamPda, getUsdcMint()).toBase58();
  const sig = await sendIx(built, connection, opts.sendTransaction);
  if (!sig) throw new Error('open_payment_stream was not submitted');

  opts.onStep?.('record-tx');
  await recordMppTxSignature(streamId, sig, {
    streamPda: streamPda.toBase58(),
    streamUsdcAta,
  });
  return {
    streamId,
    txSignature: sig,
    streamPda: streamPda.toBase58(),
    streamUsdcAta,
  };
}
