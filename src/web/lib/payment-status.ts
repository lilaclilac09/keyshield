/**
 * Honest payment settlement modes.
 *
 * Server `settle_mode` is the source of truth. A row with cost_usd > 0
 * is NOT "paid" — that was the fake-green badge. Off-chain credit
 * without a chain receipt is `stub`.
 */
export const SETTLE_MODES = ['stub', 'held', 'captured', 'submitted', 'failed'] as const;
export type SettleMode = (typeof SETTLE_MODES)[number];

/** @deprecated use SettleMode — kept so older imports compile */
export type PaymentStatus = SettleMode;

const KNOWN = new Set<string>(SETTLE_MODES);

export function isSettleMode(value: string | null | undefined): value is SettleMode {
  return !!value && KNOWN.has(value);
}

export function normalizeSettleMode(row: {
  settle_mode?: string | null;
  payment_status?: string | null;
  status_code?: number;
  cost_usd?: number;
}): SettleMode {
  const raw = String(row.settle_mode || row.payment_status || '').trim().toLowerCase();
  if (isSettleMode(raw)) return raw;
  if ((row.status_code ?? 0) >= 400) return 'failed';
  if ((row.cost_usd ?? 0) > 0) return 'stub';
  return 'held';
}

/** Alias used by Activity until call sites switch to normalizeSettleMode. */
export const inferPaymentStatus = normalizeSettleMode;

export const SETTLE_LABEL: Record<SettleMode, string> = {
  stub: 'Stub',
  held: 'Held',
  captured: 'Captured',
  submitted: 'Submitted',
  failed: 'Failed',
};

export const SETTLE_STYLE: Record<SettleMode, string> = {
  stub: 'bg-zinc-900/80 text-[#a8b3d8] border-[#3e4a72]',
  held: 'bg-amber-950/40 text-amber-300 border-amber-900/60',
  captured: 'bg-sky-950/40 text-sky-300 border-sky-900/60',
  submitted: 'bg-emerald-950/40 text-emerald-300 border-emerald-900/60',
  failed: 'bg-red-950/40 text-red-300 border-red-900/60',
};
