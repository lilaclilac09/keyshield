/**
 * Vault UI state machine — labels, legal transitions, explorer links.
 * HOLDING is the ⑤ InFlight step (not in the original six-state sketch).
 */

export type VaultState =
  | 'IDLE'
  | 'AWAITING_PASSKEY'
  | 'GENERATING_PROOF'
  | 'HOLDING'
  | 'SUBMITTING_DEVNET'
  | 'SETTLED'
  | 'FAILED';

export const VAULT_STATES: VaultState[] = [
  'IDLE',
  'AWAITING_PASSKEY',
  'GENERATING_PROOF',
  'HOLDING',
  'SUBMITTING_DEVNET',
  'SETTLED',
  'FAILED',
];

export const STATE_LABEL: Record<VaultState, string> = {
  IDLE: 'standby · balances + RPC',
  AWAITING_PASSKEY: 'WebAuthn / Touch ID',
  GENERATING_PROOF: 'local scaffold proof (100–300ms)',
  HOLDING: 'in-flight hold · artifact pending',
  SUBMITTING_DEVNET: 'sending Solana / demo-meter',
  SETTLED: 'confirmed · explorer + clipboard',
  FAILED: 'rollback · show reason',
};

const FORWARD: Record<VaultState, VaultState[]> = {
  IDLE: ['AWAITING_PASSKEY', 'FAILED'],
  AWAITING_PASSKEY: ['GENERATING_PROOF', 'IDLE', 'FAILED'],
  GENERATING_PROOF: ['HOLDING', 'SUBMITTING_DEVNET', 'SETTLED', 'FAILED'],
  HOLDING: ['SUBMITTING_DEVNET', 'SETTLED', 'FAILED'],
  SUBMITTING_DEVNET: ['SETTLED', 'FAILED'],
  SETTLED: ['IDLE', 'AWAITING_PASSKEY'],
  FAILED: ['IDLE', 'AWAITING_PASSKEY'],
};

export function canTransition(from: VaultState, to: VaultState): boolean {
  return FORWARD[from].includes(to);
}

export function formatLatencyMs(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return '…';
  return `${Math.max(0, Math.round(ms))}ms`;
}

export function explorerTxUrl(signature: string, cluster: 'devnet' | 'mainnet-beta' = 'devnet'): string {
  const base = 'https://explorer.solana.com/tx/';
  return cluster === 'mainnet-beta' ? `${base}${signature}` : `${base}${signature}?cluster=devnet`;
}

export interface ChainFeedback {
  signature: string | null;
  explorer: string | null;
  note: string;
  layer: 'none' | 'local-hold' | 'mpp-demo-meter' | 'devnet';
}

export function chainFeedback(opts: {
  signature?: string | null;
  note: string;
  layer: ChainFeedback['layer'];
}): ChainFeedback {
  const signature = opts.signature && opts.signature.length > 0 ? opts.signature : null;
  return {
    signature,
    explorer: signature ? explorerTxUrl(signature) : null,
    note: opts.note,
    layer: opts.layer,
  };
}

export { canRetryUi } from './errors';
