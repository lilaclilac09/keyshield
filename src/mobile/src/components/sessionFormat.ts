// Pure formatters used by SessionBar and SessionExpiryToast. Extracted
// so we can unit-test them in vitest without rendering RN primitives.

export function formatBarRemaining(secs: number | null): string {
  if (secs === null) return 'no session';
  if (!Number.isFinite(secs)) return '∞';
  if (secs <= 0) return 'expired';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatToastRemaining(secs: number): string {
  if (secs <= 0) return 'expired';
  if (secs < 60) return `${Math.floor(secs)}s`;
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}
