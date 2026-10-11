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

export function receiptNumber(receipt: MppShopReceipt): string {
  if (receipt.settleSlot != null) return `KS-MPP-${receipt.settleSlot}`;
  if (receipt.settleTx) return `KS-MPP-${receipt.settleTx.slice(0, 8)}`;
  return 'KS-MPP-PENDING';
}

export function receiptFilename(receipt: MppShopReceipt, ext: 'html' | 'json'): string {
  return `keyshield-receipt-${receiptNumber(receipt).toLowerCase()}.${ext}`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderMppReceiptHtml(receipt: MppShopReceipt): string {
  const no = receiptNumber(receipt);
  const open = receipt.openTx ? explorerTx(receipt.openTx) : '';
  const settle = receipt.settleTx ? explorerTx(receipt.settleTx) : '';
  const owner = receipt.owner ? explorerAddress(receipt.owner) : '';
  const stream = receipt.streamPda ? explorerAddress(receipt.streamPda) : '';
  const ata = receipt.streamAta ? explorerAddress(receipt.streamAta) : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>KeyShield receipt ${esc(no)}</title>
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; background: #0a0d1a; color: #e4e4e7; margin: 0; padding: 32px; }
    h1 { font-size: 28px; margin: 0 0 4px; }
    .sub { color: #8a96c2; margin: 0 0 24px; }
    .paid { color: #34d399; font-weight: 700; letter-spacing: 0.08em; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #243365; font-size: 14px; }
    th { color: #8a96c2; font-weight: 600; width: 28%; }
    a { color: #93b4ff; word-break: break-all; }
    code { font-family: ui-monospace, Menlo, monospace; }
  </style>
</head>
<body>
  <p class="paid">PAID · SOLANA DEVNET</p>
  <h1>Receipt ${esc(no)}</h1>
  <p class="sub">${esc(receipt.sku)} · ${esc(formatMicroUsdc(receipt.captureMicroUsdc))} USDC · not $X402 / $M32 · ix 26 mpp_settle</p>
  <table>
    <tr><th>SKU</th><td>${esc(receipt.sku)}</td></tr>
    <tr><th>OpenStream</th><td>${receipt.openTx ? `<a href="${esc(open)}">${esc(receipt.openTx)}</a>` : '—'} ${receipt.openSlot != null ? `· slot ${receipt.openSlot}` : ''}</td></tr>
    <tr><th>MppSettle</th><td>${receipt.settleTx ? `<a href="${esc(settle)}">${esc(receipt.settleTx)}</a>` : '—'} ${receipt.settleSlot != null ? `· slot ${receipt.settleSlot}` : ''} ${receipt.settleCu != null ? `· ${receipt.settleCu} CU` : ''} ${receipt.settleErr == null && receipt.settleTx ? '· err=null' : ''}</td></tr>
    <tr><th>Owner</th><td>${receipt.owner ? `<a href="${esc(owner)}">${esc(receipt.owner)}</a>` : '—'}</td></tr>
    <tr><th>Stream</th><td>${receipt.streamPda ? `<a href="${esc(stream)}">${esc(receipt.streamPda)}</a>` : '—'}</td></tr>
    <tr><th>Escrow ATA</th><td>${receipt.streamAta ? `<a href="${esc(ata)}">${esc(receipt.streamAta)}</a>` : '—'}</td></tr>
  </table>
  <table>
    <tr><th>Account</th><th>Before</th><th>After</th></tr>
    <tr><td>Owner USDC</td><td>${esc(receipt.ownerUsdcBefore ?? '—')}</td><td>${esc(receipt.ownerUsdcAfter ?? '—')}</td></tr>
    <tr><td>Stream escrow</td><td>${esc(receipt.escrowBefore ?? '—')}</td><td>${esc(receipt.escrowAfter ?? '—')}</td></tr>
    <tr><td>Platform USDC</td><td>${esc(receipt.platformBefore ?? '—')}</td><td>${esc(receipt.platformAfter ?? '—')}</td></tr>
  </table>
</body>
</html>
`;
}
