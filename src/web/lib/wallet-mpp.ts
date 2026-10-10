/**
 * One-click "open tab": open stream → build-open-tx → wallet popup →
 * record-tx → Explorer. This is the path the Activity CTA and /demo
 * wizard share. Autosign is a local-owner fallback, not a fake receipt.
 */
import { PublicKey, Transaction, type Connection } from '@solana/web3.js';
import {
  buildOpenStreamTx,
  openMppStream,
  recordMppTxSignature,
  submitAutosignOpen,
  type BuildOpenTxBody,
} from './api';
import {
  assembleOpenStreamTx,
  deriveAta,
  deriveStreamPda,
  explorerTxUrl,
  getKeyshieldProgramId,
  getUsdcMint,
  signAndConfirmTx,
} from './solana';

export const DEFAULT_TAB_CAP_MICRO = 1_000_000; // 1 Devnet USDC

export type OpenTabStep = 'open' | 'build' | 'sign' | 'record' | 'done';

export interface OpenTabResult {
  streamId: number;
  signature: string;
  explorerUrl: string;
  streamPda: string;
  mode: 'wallet' | 'autosign';
}

export interface OpenTabProgress {
  (step: OpenTabStep, detail?: string): void;
}

function requireProgramId(): PublicKey {
  const id = getKeyshieldProgramId();
  if (!id) {
    throw new Error('KEYSHIELD_PROGRAM_ID is not set');
  }
  return id;
}

export async function openStreamRow(input: {
  ownerPubkey: string;
  agentPubkey?: string;
  agentName?: string;
  upstream?: string;
  maxTotalMicroUsdc?: number;
}): Promise<{ id: number; agent_pubkey: string; max_total_micro_usdc: number | null }> {
  const agent = (input.agentPubkey || input.ownerPubkey).trim();
  const stream = await openMppStream({
    agentPubkey: agent,
    agentName: input.agentName || 'demo-tab',
    upstream: input.upstream || 'openai',
    ratePerTokenMicroUsdc: 1,
    ratePerCallMicroUsdc: 0,
    settlementIntervalSecs: 60,
    maxTotalMicroUsdc: input.maxTotalMicroUsdc ?? DEFAULT_TAB_CAP_MICRO,
  });
  return stream;
}

export async function buildAndSignOpenTab(input: {
  streamId: number;
  ownerPubkey: string;
  agentPubkey: string;
  maxTotalMicroUsdc: number;
  connection: Connection;
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>;
  onProgress?: OpenTabProgress;
}): Promise<OpenTabResult> {
  const programId = requireProgramId();
  const owner = new PublicKey(input.ownerPubkey);
  const agent = new PublicKey(input.agentPubkey);
  const [streamPda, bump] = deriveStreamPda(agent, owner, programId);
  const usdcAta = deriveAta(owner, getUsdcMint());
  const body: BuildOpenTxBody = {
    ownerPubkey: owner.toBase58(),
    streamPda: streamPda.toBase58(),
    bump,
    usdcAta: usdcAta.toBase58(),
    maxTotalMicroUsdc: input.maxTotalMicroUsdc,
    costPerUnitMicroUsdc: 1,
  };
  input.onProgress?.('build', 'build-open-tx');
  const built = await buildOpenStreamTx(input.streamId, body);
  const tx = assembleOpenStreamTx(built);
  input.onProgress?.('sign', 'approve ix 24 in the wallet');
  const signature = await signAndConfirmTx(tx, input.connection, input.sendTransaction);
  input.onProgress?.('record', signature);
  await recordMppTxSignature(input.streamId, signature);
  input.onProgress?.('done', signature);
  return {
    streamId: input.streamId,
    signature,
    explorerUrl: explorerTxUrl(signature),
    streamPda: streamPda.toBase58(),
    mode: 'wallet',
  };
}

/** Wallet path. Throws if the adapter cannot sign. */
export async function openStreamTabWallet(input: {
  ownerPubkey: string;
  agentPubkey?: string;
  maxTotalMicroUsdc?: number;
  connection: Connection;
  sendTransaction: (tx: Transaction, conn: Connection) => Promise<string>;
  onProgress?: OpenTabProgress;
}): Promise<OpenTabResult> {
  const cap = input.maxTotalMicroUsdc ?? DEFAULT_TAB_CAP_MICRO;
  input.onProgress?.('open', 'POST /mpp/streams');
  const stream = await openStreamRow({
    ownerPubkey: input.ownerPubkey,
    agentPubkey: input.agentPubkey,
    maxTotalMicroUsdc: cap,
  });
  return buildAndSignOpenTab({
    streamId: stream.id,
    ownerPubkey: input.ownerPubkey,
    agentPubkey: stream.agent_pubkey,
    maxTotalMicroUsdc: cap,
    connection: input.connection,
    sendTransaction: input.sendTransaction,
    onProgress: input.onProgress,
  });
}

/** Local owner keystore — same on-chain ix 24, no browser popup. */
export async function openStreamTabAutosign(input: {
  ownerPubkey?: string;
  agentPubkey?: string;
  maxTotalMicroUsdc?: number;
  onProgress?: OpenTabProgress;
}): Promise<OpenTabResult> {
  input.onProgress?.('open', 'POST /mpp/autosign/open');
  const result = await submitAutosignOpen({
    agentPubkey: input.agentPubkey || input.ownerPubkey || '',
    agentName: 'demo-tab',
    upstream: 'openai',
    maxTotalMicroUsdc: input.maxTotalMicroUsdc ?? DEFAULT_TAB_CAP_MICRO,
  });
  const signature = String(result.signature || result.tx_signature || result.on_chain_signature || '');
  if (!signature) {
    throw new Error('autosign returned no signature');
  }
  input.onProgress?.('done', signature);
  return {
    streamId: Number(result.stream_id || result.stream?.id || 0),
    signature,
    explorerUrl: explorerTxUrl(signature),
    streamPda: String(result.stream_pda || result.stream?.stream_pda || ''),
    mode: 'autosign',
  };
}

