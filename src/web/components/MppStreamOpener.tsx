/**
 * MppStreamOpener — sign + submit the 3-ix MPP open-stream Transaction.
 * Spec 15: prereq Create-ATA + fund transfer + open_payment_stream.
 */
import React, { useState, useCallback, useMemo } from 'react';
import { Loader2, ExternalLink, Wallet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { Button } from './ui/Button';
import { buildOpenStreamTx, recordMppTxSignature } from '../lib/api';
import {
  assembleOpenTxIxsForSign,
  decodeIxData,
  type MppBuildOpenTxResponse,
} from '../lib/wallet-mpp';
import {
  deriveStreamPda,
  deriveAta,
  getUsdcMint,
  getKeyshieldProgramId,
  explorerTxUrl,
} from '../lib/solana';

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
  streamId: number;
  agentPubkey: string;
  maxTotalMicroUsdc?: number;
  className?: string;
  onSuccess?: (signature: string) => void;
}

export const MppStreamOpener: React.FC<MppStreamOpenerProps> = ({
  streamId,
  agentPubkey,
  maxTotalMicroUsdc = 1_000_000,
  className,
  onSuccess,
}) => {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const programId = useMemo(() => getKeyshieldProgramId(), []);
  const usdcMint = useMemo(() => getUsdcMint(), []);

  const handleClick = useCallback(async () => {
    if (!publicKey || !programId) return;
    setStatus({ kind: 'loading', phase: 'build' });
    try {
      const owner = publicKey;
      const agent = new PublicKey(agentPubkey);
      const [streamPda, bump] = deriveStreamPda(agent, owner, programId);
      const ownerUsdcAta = deriveAta(owner, usdcMint);

      const built = (await buildOpenStreamTx(streamId, {
        ownerPubkey: owner.toBase58(),
        streamPda: streamPda.toBase58(),
        bump,
        usdcAta: ownerUsdcAta.toBase58(),
        maxTotalMicroUsdc,
      })) as MppBuildOpenTxResponse;

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

      const tx = new Transaction().add(...ixs);
      tx.feePayer = owner;
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;

      setStatus({ kind: 'loading', phase: 'sign' });
      const signature = await sendTransaction(tx, connection);

      setStatus({ kind: 'loading', phase: 'confirm' });
      await connection.confirmTransaction(signature, 'confirmed');

      try {
        await recordMppTxSignature(streamId, signature);
      } catch {
        /* tx already on-chain */
      }

      setStatus({
        kind: 'success',
        signature,
        streamUsdcAta: built.streamUsdcAta,
      });
      onSuccess?.(signature);
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
    onSuccess,
  ]);

  if (!programId) {
    return (
      <span className="text-[11px] text-[#5e6a91]">
        Set KEYSHIELD_PROGRAM_ID to enable on-chain MPP.
      </span>
    );
  }

  if (!publicKey) {
    return (
      <Button size="sm" variant="secondary" disabled className={className} title="Connect wallet first">
        <Wallet size={14} />
        Sign &amp; open on-chain
      </Button>
    );
  }

  if (status.kind === 'success') {
    return (
      <div className={`flex flex-col gap-1 ${className ?? ''}`}>
        <a
          href={explorerTxUrl(status.signature)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400 hover:underline"
        >
          <CheckCircle2 size={14} />
          Stream opened on-chain
          <ExternalLink size={12} />
        </a>
      </div>
    );
  }

  if (status.kind === 'error') {
    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <Button size="sm" variant="secondary" onClick={handleClick} title={status.message}>
          <Wallet size={14} />
          Retry
        </Button>
        <span className="text-[11px] text-red-400 truncate max-w-[200px]" title={status.message}>
          <AlertCircle size={12} className="inline mr-1" />
          {status.message}
        </span>
      </div>
    );
  }

  if (status.kind === 'loading') {
    return (
      <Button size="sm" variant="secondary" disabled loading className={className}>
        {PHASE_LABEL[status.phase]}
      </Button>
    );
  }

  return (
    <Button size="sm" variant="secondary" onClick={handleClick} className={className}>
      <Wallet size={14} />
      Sign &amp; open on-chain
    </Button>
  );
};
