/**
 * Phantom SOL top-up — quote → SystemProgram.transfer (+ memo) → /billing/topup-solana.
 * Uses an explicit connection from the quote cluster (Devnet by default).
 * The wallet-adapter provider is also Devnet so Solflare will sign.
 */
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  clusterApiUrl,
} from '@solana/web3.js';
import { creditSolanaTopup, fetchSolQuote } from './api';

const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

export async function topupSolWithWallet(opts: {
  amountUsd: number;
  ownerPubkey: string;
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>;
}): Promise<{ creditedUsd: number; balanceUsd: number; txSignature: string }> {
  const quote = await fetchSolQuote(opts.amountUsd);
  const cluster = quote.cluster === 'mainnet' ? 'mainnet-beta' : 'devnet';
  const connection = new Connection(clusterApiUrl(cluster), 'confirmed');
  const from = new PublicKey(opts.ownerPubkey);
  const to = new PublicKey(quote.payment_address);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: quote.amount_lamports,
    }),
  );
  if (quote.memo) {
    tx.add(
      new TransactionInstruction({
        keys: [{ pubkey: from, isSigner: true, isWritable: false }],
        programId: MEMO_PROGRAM,
        data: Buffer.from(quote.memo, 'utf8'),
      }),
    );
  }
  const sig = await opts.sendTransaction(tx, connection);
  const latest = await connection.getLatestBlockhash();
  await connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');
  const credited = await creditSolanaTopup({
    txSignature: sig,
    expectedAmountUsd: opts.amountUsd,
    memo: quote.memo,
    wallet: opts.ownerPubkey,
  });
  return {
    creditedUsd: credited.credited_usd,
    balanceUsd: credited.balance_usd,
    txSignature: credited.tx_signature,
  };
}
