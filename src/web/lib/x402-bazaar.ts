/**
 * Third-party x402 offers we actually probed.
 * LIVE = Solana Devnet + Circle USDC exact accept.
 * NOT_SURFACE = wrong chain, wrong mint, or not a KeyShield SKU.
 * Does not invent a shop token. Not Raydium / $X402 / $M32.
 */

export const CIRCLE_DEVNET_USDC = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
export const SOLANA_DEVNET_CAIP = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1';

export type SurfaceStatus = 'LIVE' | 'NOT_SURFACE';

export type X402Accept = {
  network?: string;
  asset?: string;
  amount?: string;
  maxAmountRequired?: string;
  payTo?: string;
};

export type BazaarOffer = {
  id: string;
  name: string;
  method: string;
  url: string;
  status: SurfaceStatus;
  detail: string;
  amountLabel?: string;
};

export function microFromAccept(accept: X402Accept): number {
  const raw = accept.amount ?? accept.maxAmountRequired ?? '0';
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function isSolanaDevnetCircleUsdc(accept: X402Accept): boolean {
  return String(accept.network || '') === SOLANA_DEVNET_CAIP
    && String(accept.asset || '') === CIRCLE_DEVNET_USDC;
}

export function classifyX402Accepts(accepts: X402Accept[]): {
  status: SurfaceStatus;
  reason: string;
  live?: X402Accept;
  micro?: number;
} {
  const rows = Array.isArray(accepts) ? accepts : [];
  const live = rows.find(isSolanaDevnetCircleUsdc);
  if (live) {
    return {
      status: 'LIVE',
      reason: 'Solana Devnet Circle USDC exact',
      live,
      micro: microFromAccept(live),
    };
  }
  if (rows.some((a) => String(a.network || '').startsWith('eip155:'))) {
    return {
      status: 'NOT_SURFACE',
      reason: 'Pays EVM/Base USDC, not Solana Devnet Circle USDC',
    };
  }
  if (rows.some((a) => String(a.network || '').startsWith('solana:'))) {
    return {
      status: 'NOT_SURFACE',
      reason: 'Solana but not Circle Devnet USDC',
    };
  }
  return { status: 'NOT_SURFACE', reason: 'No Solana Devnet Circle USDC accept' };
}

export function decodePaymentRequiredHeader(value: string): unknown {
  const txt = String(value || '').trim();
  if (!txt) return null;
  if (txt === 'x402') return { x402: true };
  try {
    const json = typeof atob === 'function'
      ? atob(txt)
      : Buffer.from(txt, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Catalog from the live 2026-10-12 probe. KeyShield cannot settle these 402s. */
export const BAZAAR_OFFERS: BazaarOffer[] = [
  {
    id: 'crypto-regime',
    name: 'Crypto Regime API',
    method: 'GET',
    url: 'https://crypto-regime-api.onrender.com/v1/tokens',
    status: 'LIVE',
    amountLabel: '0.02 USDC',
    detail: 'HTTP 402 · x402 v2 exact · Circle Devnet USDC. KeyShield shop cannot settle this 402 — not an MPP SKU.',
  },
  {
    id: 'quicknode',
    name: 'Quicknode x402 RPC',
    method: 'GET',
    url: 'https://x402.quicknode.com/solana-devnet',
    status: 'NOT_SURFACE',
    detail: 'Now Cloudflare 403 from this VM. When it returned 402, accepts paid Base USDC (eip155), not Circle Devnet USDC.',
  },
  {
    id: 'payai',
    name: 'PayAI Bazaar discovery',
    method: 'GET',
    url: 'https://facilitator.payai.network/discovery/resources?network=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
    status: 'LIVE',
    detail: 'Discovery only — lists Crypto Regime and other Circle Devnet USDC 402s. Not a KeyShield SKU.',
  },
];

/** Extra PayAI rows that also accept Solana Devnet Circle USDC. Not KeyShield SKUs. */
export const PAYAI_LIVE_EXTRAS: BazaarOffer[] = [
  {
    id: 'quaestor',
    name: 'Quaestor quote-check',
    method: 'GET',
    url: 'https://quaestor-stocks.onrender.com/v1/intel/quote-check',
    status: 'LIVE',
    amountLabel: '0.005 USDC',
    detail: 'PayAI discovery · Circle Devnet USDC exact. Not a KeyShield SKU.',
  },
  {
    id: 'ekospor',
    name: 'Ekospor index',
    method: 'GET',
    url: 'https://api.ekospor.com/v1/endeks',
    status: 'LIVE',
    amountLabel: '0.02 USDC',
    detail: 'PayAI discovery · Circle Devnet USDC exact. Not a KeyShield SKU.',
  },
];
