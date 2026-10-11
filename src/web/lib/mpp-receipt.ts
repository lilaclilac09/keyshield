/**
 * MPP shop receipt — explorer links + the live 2.00 USDC Devnet buy.
 * Not a Raydium / Pump.fun token receipt.
 */

export const DEVNET_EXPLORER = 'https://explorer.solana.com';
export const DEVNET_CLUSTER = 'devnet';

export type MppShopReceipt = {
  sku: string;
  network: 'solana-devnet';
  openTx: string | null;
  openSlot: number | null;
  settleTx: string | null;
  settleSlot: number | null;
  settleCu: number | null;
  settleErr: string | null;
  owner: string;
  streamPda: string | null;
  streamAta: string | null;
  captureMicroUsdc: number;
  ownerUsdcBefore: string | null;
  ownerUsdcAfter: string | null;
  escrowBefore: string | null;
  escrowAfter: string | null;
  platformBefore: string | null;
  platformAfter: string | null;
};

export const MPP_SHOP_SKU = '2.00 USDC MPP capture';
export const MPP_SHOP_OPEN_MICRO = 5_000_000;
export const MPP_SHOP_CAPTURE_MICRO = 2_000_000;

/** Last live GHpm buy on Devnet (open 5.00, capture 2.00). */
export const LAST_LIVE_MPP_RECEIPT: MppShopReceipt = {
  sku: MPP_SHOP_SKU,
  network: 'solana-devnet',
  openTx: '4YW8ffsbMHhthcCrbfcHbqvi2Aw5B5V7pRa9bEUQAdsTUNNtcfhxJG7hgJP93hsit6YnyUSeHyLyaZ1eDaP12ici',
  openSlot: 509959472,
  settleTx: '3tGEtZ65Hop8mB4EYadBhq4QxgBNfjRBTQufS6hjD4Tb7i7ZXQ6n6VwCggT9bSjuuRLouRs9Q16RbXAasYVDm8Yb',
  settleSlot: 509959477,
  settleCu: 1986,
  settleErr: null,
  owner: 'GHpmxvrXbAfc5XWG7mPrJFqchWEQC6mc2hyStP5P4bhq',
  streamPda: 'jhgpjSE2unJyjTGzFPfJLPu7zxbiTHCWAsiNvmUiwzj',
  streamAta: 'HEmJmhGCum3SupCfVwDaCt2WuJPyeoy1NJ21HYjHGYnS',
  captureMicroUsdc: MPP_SHOP_CAPTURE_MICRO,
  ownerUsdcBefore: '17.89',
  ownerUsdcAfter: '12.89',
  escrowBefore: '5',
  escrowAfter: '3',
  platformBefore: '0.60001',
  platformAfter: '2.60001',
};

export function explorerTx(signature: string): string {
  return `${DEVNET_EXPLORER}/tx/${signature}?cluster=${DEVNET_CLUSTER}`;
}

export function explorerAddress(address: string): string {
  return `${DEVNET_EXPLORER}/address/${address}?cluster=${DEVNET_CLUSTER}`;
}

export function shortSig(value: string, head = 8, tail = 6): string {
  if (!value || value.length <= head + tail + 1) return value || '—';
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatMicroUsdc(micro: number): string {
  return (micro / 1_000_000).toFixed(micro % 1_000_000 === 0 ? 2 : 6);
}

export function describeMppReceipt(receipt: MppShopReceipt): string {
  const settle = receipt.settleTx ? shortSig(receipt.settleTx) : 'pending';
  return `${receipt.sku} · settle ${settle} · ${formatMicroUsdc(receipt.captureMicroUsdc)} USDC`;
}

export function isMppShopReceipt(value: unknown): value is MppShopReceipt {
  if (!value || typeof value !== 'object') return false;
  const row = value as MppShopReceipt;
  return row.network === 'solana-devnet' && typeof row.sku === 'string'
    && typeof row.captureMicroUsdc === 'number';
}
