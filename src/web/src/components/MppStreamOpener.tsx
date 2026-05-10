/**
 * MppStreamOpener — sign + submit a 3-ix MPP open-stream Transaction.
 *
 * Wire contract (POST /mpp/streams/:id/build-open-tx returns):
 *   prereqIxs[0]  Create stream-PDA-owned USDC ATA (SPL ATA disc=1)
 *   prereqIxs[1]  TransferChecked: owner USDC ATA → stream USDC ATA
 *   main          KeyShield ix #24 open_payment_stream
 *
 * The previous v2 sent ONE ix (just main) → mpp_settle hit OwnerMismatch
 * (0x4) on devnet (commit 9974a8e85). This version assembles all three
 * via `assembleOpenTxIxsForSign(response)`.
 */
import { useState, useCallback, useMemo, type ReactElement } from 'react';
import { Loader2, ExternalLink, Wallet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@keyshield/ui';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { buildMppOpenTx, recordMppTx } from '@keyshield/shared/api';
import {
  assembleOpenTxIxsForSign,
  decodeIxData,
} from '@keyshield/shared/lib/wallet-mpp';

// ── Constants (devnet defaults; overrideable via Vite env) ──────────
// vite-env.d.ts narrows ImportMetaEnv to just VITE_API_URL today, so
// reach through `as any` for these optional vars (matches the pattern
// in CreateAgentSignerButton.tsx).
const PROGRAM_ID_STR =
  (import.meta as any).env?.VITE_KEYSHIELD_PROGRAM_ID ??
  '41P2wHKAr69aSgLgt1QdKH6VVgK6uFYKM7hpKAyBxr9j';
const USDC_MINT_STR =
  (import.meta as any).env?.VITE_KEYSHIELD_USDC_MINT ??
  '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const SOLANA_CLUSTER =
  (import.meta as any).env?.VITE_SOLANA_CLUSTER ?? 'devnet';

// SPL Token + ATA program IDs — derive ATA manually (no @solana/spl-token
// dep; only Agent F1 may edit package.json).
const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);

// PDA seed mirrors the on-chain `seeds!` macro for AgentPaymentStream.
const PAYMENT_STREAM_SEED = new TextEncoder().encode('agent_payment_stream');

function deriveStreamPda(
  agent: PublicKey,
  owner: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PAYMENT_STREAM_SEED, agent.toBuffer(), owner.toBuffer()],
    programId,
  );
}

/** Standard SPL ATA derivation: PDA(owner, tokenProgram, mint). */
function deriveAssociatedTokenAddress(
  owner: PublicKey,
  mint: PublicKey,
): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}

function explorerUrl(sig: string): string {
  const isMainnet =
    SOLANA_CLUSTER === 'mainnet' || SOLANA_CLUSTER === 'mainnet-beta';
  const c = isMainnet ? '' : `?cluster=${SOLANA_CLUSTER}`;
  return `https://explorer.solana.com/tx/${sig}${c}`;
}

function shortAddr(s: string): string {
  return s.length <= 12 ? s : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; phase: 'build' | 'sign' | 'confirm' }
  | { kind: 'success'; signature: string; streamUsdcAta: string }
  | { kind: 'error'; message: string };

const PHASE_LABEL: Record<'build' | 'sign' | 'confirm', string> = {
  build: 'Building tx…',
  sign: 'Awaiting wallet…',
  confirm: 'Confirming…',
};

export interface MppStreamOpenerProps {
  streamId: string;
  agentPubkey: string;
  /**
   * Optional cap (micro-USDC). Defaults to 1 USDC so the Use-button
   * works without prop drilling. Wire a real cap from the device-vault
   * page when its UI surfaces a value.
   */
  maxTotalMicroUsdc?: number;
  className?: string;
}

export function MppStreamOpener({
  streamId,
  agentPubkey,
  maxTotalMicroUsdc = 1_000_000,
  className,
}: MppStreamOpenerProps): ReactElement {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const programId = useMemo(() => new PublicKey(PROGRAM_ID_STR), []);
  const usdcMint = useMemo(() => new PublicKey(USDC_MINT_STR), []);

  const handleClick = useCallback(async () => {
    if (!publicKey) return;
    setStatus({ kind: 'loading', phase: 'build' });
    try {
      const owner = publicKey;
      const agent = new PublicKey(agentPubkey);

      // 1. Derive PDAs
      const [streamPda, bump] = deriveStreamPda(agent, owner, programId);
      const ownerUsdcAta = deriveAssociatedTokenAddress(owner, usdcMint);

      // 2. Server returns the unsigned ix bundle
      const built = await buildMppOpenTx(streamId, {
        ownerPubkey: owner.toBase58(),
        streamPda: streamPda.toBase58(),
        bump,
        usdcAta: ownerUsdcAta.toBase58(),
        maxTotalMicroUsdc,
      });

      // 3. Convert the JSON ixs to web3.js TransactionInstructions
      const ixs = assembleOpenTxIxsForSign(built).map(
        (j) =>
          new TransactionInstruction({
            programId: new PublicKey(j.programId),
            keys: j.keys.map((k) => ({
              pubkey: new PublicKey(k.pubkey),
              isSigner: k.isSigner,
              isWritable: k.isWritable,
            })),
            data: Buffer.from(decodeIxData(j.data)),
          }),
      );

      // 4. Build the Transaction
      const tx = new Transaction().add(...ixs);
      tx.feePayer = owner;
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;

      // 5. Sign + send via the wallet adapter
      setStatus({ kind: 'loading', phase: 'sign' });
      const signature = await sendTransaction(tx, connection);

      // 6. Confirm
      setStatus({ kind: 'loading', phase: 'confirm' });
      await connection.confirmTransaction(signature, 'confirmed');

      // 7. Persist on the server (non-fatal — tx is already on-chain).
      try {
        await recordMppTx(streamId, signature);
      } catch {
        /* swallow: confirmation already happened */
      }

      setStatus({
        kind: 'success',
        signature,
        streamUsdcAta: built.streamUsdcAta,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error';
      setStatus({ kind: 'error', message: message.slice(0, 240) });
    }
  }, [
    publicKey,
    agentPubkey,
    programId,
    usdcMint,
    streamId,
    maxTotalMicroUsdc,
    connection,
    sendTransaction,
  ]);

  // ── Render ──────────────────────────────────────────────────────
  if (!publicKey) {
    return (
      <Button
        size="sm"
        variant="secondary"
        disabled
        title="connect wallet first"
        className={className}
      >
        <Wallet className="h-3.5 w-3.5 mr-1.5" />
        Sign &amp; open on-chain stream
      </Button>
    );
  }

  if (status.kind === 'success') {
    return (
      <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
        <a
          href={explorerUrl(status.signature)}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 text-xs"
          style={{ color: '#10b981' }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Stream opened on-chain</span>
          <ExternalLink className="h-3 w-3" />
        </a>
        <p className="text-[11px] font-mono" style={{ color: '#6b6b7a' }}>
          encrypted-key budget went to:{' '}
          <span style={{ color: '#a0a0b0' }}>{shortAddr(status.streamUsdcAta)}</span>
        </p>
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <Button size="sm" variant="secondary" onClick={handleClick} title={status.message}>
          <Wallet className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
        <span
          className="inline-flex items-center gap-1 text-xs"
          style={{ color: '#ef4444' }}
          title={status.message}
        >
          <AlertCircle className="h-3 w-3" />
          {status.message.length > 60 ? `${status.message.slice(0, 60)}…` : status.message}
        </span>
      </div>
    );
  }

  if (status.kind === 'loading') {
    return (
      <Button size="sm" variant="secondary" disabled className={className}>
        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        {PHASE_LABEL[status.phase]}
      </Button>
    );
  }

  return (
    <Button size="sm" variant="secondary" onClick={handleClick} className={className}>
      <Wallet className="h-3.5 w-3.5 mr-1.5" />
      Sign &amp; open on-chain stream
    </Button>
  );
}

export default MppStreamOpener;
