/**
 * Per-IP rate limit for the public /auth/* POSTs.
 *
 * Every one of those routes reads or writes R2 (Class A/B operations) before
 * any credential is checked, so an unthrottled client can run up the bill and
 * fill the registry with challenge objects.
 *
 * Production uses the Workers Rate Limiting binding `AUTH_RATE_LIMITER`
 * (wrangler.toml). When the binding is absent (older local setups), a small
 * per-isolate fixed window is used instead: best effort, but still bounded.
 */

export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** Keep in sync with `simple = { limit, period }` in wrangler.toml. */
export const AUTH_LIMIT = 20;
export const AUTH_PERIOD_SECS = 60;

const windows = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 5000;

function memoryAllow(key: string, now: number): boolean {
  const hit = windows.get(key);
  if (!hit || now >= hit.resetAt) {
    if (windows.size >= MAX_KEYS) windows.clear();
    windows.set(key, { count: 1, resetAt: now + AUTH_PERIOD_SECS * 1000 });
    return true;
  }
  hit.count += 1;
  return hit.count <= AUTH_LIMIT;
}

/** Test hook. */
export function resetMemoryWindows(): void {
  windows.clear();
}

export function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export async function allowAuthRequest(
  binding: RateLimitBinding | undefined,
  route: string,
  ip: string,
  now = Date.now(),
): Promise<boolean> {
  const key = `${route}:${ip}`;
  if (binding && typeof binding.limit === 'function') {
    try {
      const { success } = await binding.limit({ key });
      return success;
    } catch {
      // Binding hiccup: fall through to the local window rather than fail open.
    }
  }
  return memoryAllow(key, now);
}
