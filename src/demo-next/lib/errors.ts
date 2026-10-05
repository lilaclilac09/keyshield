/**
 * Error / rollback semantics for the demo vault UI.
 *
 * Pinocchio custom codes (not Anchor), but the UI still prints the
 * familiar names: CapExceeded, NullifierUsed, …
 */

export type FailKind = 'local-cancel' | 'local-error' | 'chain-failed' | 'pending' | null;

/** Three rollback meanings — never collapse them. */
export type RollbackKind = 'local-cancel' | 'chain-rollback' | 'grant-revoke' | null;

export const ROLLBACK_LABEL: Record<Exclude<RollbackKind, null>, string> = {
  'local-cancel': 'local cancel — account & policy unchanged',
  'chain-rollback': 'on-chain reverse needs a new signed tx — UI cannot rewind a landed ix',
  'grant-revoke': 'authorization revoke — memory grant only, not a chain rollback',
};

export const PROGRAM_ERROR_NAME: Record<number, string> = {
  6103: 'NotOwner',
  6108: 'UnverifiedFulfillment',
  6109: 'InvalidMint',
  6111: 'SettlementReplay',
  6115: 'DisputeWindowActive',
  6116: 'SessionRevoked',
  6117: 'NullifierUsed',
  6118: 'CapExceeded',
  6119: 'ProofExpired',
  6120: 'ZkVaultAlreadyExists',
  6121: 'ZkVaultRevoked',
  6123: 'Groth16VkMissing',
  6125: 'ScaffoldTranscriptMismatch',
};

export interface ParsedChainError {
  code: number | null;
  name: string;
  message: string;
}

export interface FlowBreakpoint {
  completed: string[];
  failed: string | null;
  reason: string | null;
}

export function emptyBreakpoint(): FlowBreakpoint {
  return { completed: [], failed: null, reason: null };
}

export function markBreakpoint(completed: string[], failed: string, reason: string): FlowBreakpoint {
  return { completed: [...completed], failed: failed || null, reason: reason || null };
}

export function formatBreakpoint(bp: FlowBreakpoint): string {
  const ok = bp.completed.length ? bp.completed.map((s) => `${s}:ok`).join(' · ') : 'none';
  if (!bp.failed) return ok;
  return `${ok} · ${bp.failed}:FAIL (${bp.reason})`;
}

const NAME_TO_CODE = Object.fromEntries(
  Object.entries(PROGRAM_ERROR_NAME).map(([code, name]) => [name.toLowerCase(), Number(code)]),
) as Record<string, number>;

export function parseChainError(input: unknown): ParsedChainError {
  const raw = input instanceof Error ? input.message : String(input ?? '');
  const custom = raw.match(/custom program error:\s*(0x[0-9a-f]+|\d+)/i);
  const named = raw.match(
    /\b(CapExceeded|NullifierUsed|NotOwner|InvalidMint|CounterfeitMint|Unauthorized|SettlementReplay|DisputeWindowActive|SessionRevoked|ProofExpired|ZkVaultAlreadyExists|Groth16VkMissing|ScaffoldTranscriptMismatch|UnverifiedFulfillment)\b/,
  );
  if (named) {
    const name = named[1] === 'CounterfeitMint' ? 'InvalidMint' : named[1] === 'Unauthorized' ? 'NotOwner' : named[1];
    return {
      code: NAME_TO_CODE[name.toLowerCase()] ?? null,
      name,
      message: `${name}${NAME_TO_CODE[name.toLowerCase()] != null ? ` ${NAME_TO_CODE[name.toLowerCase()]}` : ''} — refetch chain, drop local draft`,
    };
  }
  if (custom) {
    const token = custom[1];
    const code = token.startsWith('0x') || token.startsWith('0X') ? Number.parseInt(token, 16) : Number(token);
    const name = PROGRAM_ERROR_NAME[code] || `Custom${code}`;
    return { code, name, message: `${name} ${code} — refetch chain, drop local draft` };
  }
  return { code: null, name: 'UnknownChainError', message: raw || 'unknown chain error' };
}

export function isWalletReject(err: unknown): boolean {
  if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) return true;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return /user rejected|rejected the request|wallet.*cancel|WalletSign|WalletNotConnected|timeout|timed out/i.test(msg);
}

export function shouldLockRetry(pendingLocked: boolean, confirmation: 'unknown' | 'confirmed' | 'failed' | null): boolean {
  return pendingLocked || confirmation === 'unknown';
}

export function canRetryUi(state: string, pendingLocked: boolean, confirmation?: 'unknown' | 'confirmed' | 'failed' | null): boolean {
  if (shouldLockRetry(pendingLocked, confirmation ?? null)) return false;
  return state === 'FAILED';
}
