const DEVNET = 'https://api.devnet.solana.com';

export async function pingDevnetSlot(): Promise<{ ms: number; slot: number | null }> {
  const t0 = performance.now();
  try {
    const r = await fetch(DEVNET, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash' }),
      cache: 'no-store',
    });
    const ms = Math.round(performance.now() - t0);
    if (!r.ok) return { ms, slot: null };
    const body = await r.json();
    const slot = body?.result?.context?.slot ?? body?.result?.value?.lastValidBlockHeight ?? null;
    return { ms, slot: typeof slot === 'number' ? slot : null };
  } catch {
    return { ms: Math.round(performance.now() - t0), slot: null };
  }
}
