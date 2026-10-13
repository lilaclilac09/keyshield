/**
 * Payments ledger: every buy, grouped, with Solana explorer links.
 * On-chain MPP / Solana top-up / ledger credit / x402 probed.
 * Not Raydium / $X402 / $M32. Tempo settlement is archived.
 */

import { apiFetch } from './auth';
import {
  explorerAddress,
  explorerTx,
  formatMicroUsdc,
  shortSig,
  type MppShopReceipt,
} from './mpp-receipt';
import { loadMppReceiptHistory } from './mpp-shop';
import { formatStoredApiCard, providerMeta } from './provider-catalog';
import { formatUsd, SHOP_CREDIT_USD, SHOP_ITEM_NAME } from './shop-demo';
import { BAZAAR_OFFERS, PAYAI_LIVE_EXTRAS } from './x402-bazaar';
import type { KeychainStoredApi } from './keychain';

export type PurchaseKind = 'on-chain-mpp' | 'ledger' | 'solana-topup' | 'vault-api' | 'x402';

export type PurchaseRail = 'solana-mpp' | 'solana-topup' | 'ledger' | 'x402' | 'tempo';

export type ExplorerLink = { label: string; href: string };

export type WalletRole = 'user' | 'agent' | 'ledger' | 'none';

export type PurchaseRow = {
  id: string;
  kind: PurchaseKind;
  category: string;
  title: string;
  amountLabel: string;
  sizeLabel: string;
  txType: string;
  rail: PurchaseRail;
  railLabel: string;
  walletRole: WalletRole;
  walletLabel: string;
  detail: string;
  explorer: ExplorerLink[];
  receipt?: MppShopReceipt;
};

export function railLabel(rail: PurchaseRail): string {
  if (rail === 'solana-mpp') return 'Solana Devnet · MPP';
  if (rail === 'solana-topup') return 'Solana Devnet · top-up';
  if (rail === 'ledger') return 'Ledger · off-chain';
  if (rail === 'x402') return 'x402 · probed';
  return 'Tempo · archived';
}

function shortWallet(addr: string): string {
  const text = String(addr || '').trim();
  if (text.length <= 12) return text || '—';
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

export type LedgerPurchase = {
  id: string;
  name: string;
  amountUsd: number;
  at: number;
};

export type MppStreamPurchase = {
  id: number;
  agent_name?: string;
  agent_pubkey?: string;
  upstream?: string;
  status?: string;
  settled_micro_usdc?: number;
  on_chain_signature?: string | null;
  stream_pda?: string | null;
  stream_usdc_ata?: string | null;
  total_calls?: number;
};

export type SolanaTopup = {
  tx_signature: string;
  chain?: string;
  asset?: string;
  amount_usd: number;
  credited_at?: number;
};

const LEDGER_KEY = 'ks_ledger_purchases';

export const ON_CHAIN_CATEGORY = 'On-chain MPP';
export const SOLANA_TOPUP_CATEGORY = 'Solana top-up';
export const LEDGER_CATEGORY = 'Ledger credit';
export const X402_CATEGORY = 'x402 probed';

export const LAST_LIVE_LEDGER: LedgerPurchase = {
  id: 'ledger-shop-credit-010',
  name: SHOP_ITEM_NAME,
  amountUsd: SHOP_CREDIT_USD,
  at: 1,
};

export const PURCHASE_CATEGORY_ORDER = [
  ON_CHAIN_CATEGORY,
  SOLANA_TOPUP_CATEGORY,
  LEDGER_CATEGORY,
  X402_CATEGORY,
] as const;

function ledgerStore(): Storage | null {
  if (typeof localStorage !== 'undefined') return localStorage;
  if (typeof sessionStorage !== 'undefined') return sessionStorage;
  return null;
}

export function explorerLinksForReceipt(receipt: MppShopReceipt): ExplorerLink[] {
  const links: ExplorerLink[] = [];
  if (receipt.openTx) {
    links.push({ label: `Open ${shortSig(receipt.openTx)}`, href: explorerTx(receipt.openTx) });
  }
  if (receipt.settleTx) {
    links.push({ label: `Settle ${shortSig(receipt.settleTx)}`, href: explorerTx(receipt.settleTx) });
  }
  if (receipt.streamPda) {
    links.push({ label: `Stream ${shortSig(receipt.streamPda)}`, href: explorerAddress(receipt.streamPda) });
  }
  if (receipt.streamAta) {
    links.push({ label: `ATA ${shortSig(receipt.streamAta)}`, href: explorerAddress(receipt.streamAta) });
  }
  if (receipt.owner) {
    links.push({ label: `Owner ${shortSig(receipt.owner)}`, href: explorerAddress(receipt.owner) });
  }
  return links;
}

export function mppPurchaseFromReceipt(receipt: MppShopReceipt): PurchaseRow {
  const cu = receipt.settleCu != null ? ` · ${receipt.settleCu.toLocaleString()} CU` : '';
  return {
    id: `mpp-${receipt.settleTx || receipt.openTx || receipt.sku}`,
    kind: 'on-chain-mpp',
    category: ON_CHAIN_CATEGORY,
    title: receipt.sku,
    amountLabel: `${formatMicroUsdc(receipt.captureMicroUsdc)} USDC`,
    sizeLabel: `${formatMicroUsdc(receipt.captureMicroUsdc)} USDC`,
    txType: 'On-chain MPP settle',
    rail: 'solana-mpp',
    railLabel: railLabel('solana-mpp'),
    walletRole: 'user',
    walletLabel: receipt.owner ? `User · ${shortWallet(receipt.owner)}` : 'User wallet',
    detail: `${receipt.network}${cu}`,
    explorer: explorerLinksForReceipt(receipt),
    receipt,
  };
}

export function purchaseFromMppStream(stream: MppStreamPurchase): PurchaseRow | null {
  const settled = Number(stream.settled_micro_usdc || 0);
  const sig = String(stream.on_chain_signature || '').trim();
  const pda = String(stream.stream_pda || '').trim();
  if (settled <= 0 && !sig) return null;
  const explorer: ExplorerLink[] = [];
  if (sig) explorer.push({ label: `Settle ${shortSig(sig)}`, href: explorerTx(sig) });
  if (pda) explorer.push({ label: `Stream ${shortSig(pda)}`, href: explorerAddress(pda) });
  const ata = String(stream.stream_usdc_ata || '').trim();
  if (ata) explorer.push({ label: `ATA ${shortSig(ata)}`, href: explorerAddress(ata) });
  const upstream = stream.upstream || 'mpp';
  const name = (stream.agent_name || '').trim() || `${upstream} stream #${stream.id}`;
  return {
    id: `mpp-stream-${stream.id}`,
    kind: 'on-chain-mpp',
    category: ON_CHAIN_CATEGORY,
    title: name,
    amountLabel: `${formatMicroUsdc(settled)} USDC`,
    sizeLabel: `${formatMicroUsdc(settled)} USDC`,
    txType: 'On-chain MPP stream',
    rail: 'solana-mpp',
    railLabel: railLabel('solana-mpp'),
    walletRole: 'agent',
    walletLabel: stream.agent_name
      ? `Agent · ${stream.agent_name}`
      : stream.agent_pubkey
        ? `Agent · ${shortWallet(stream.agent_pubkey)}`
        : 'Agent wallet',
    detail: `${stream.status || 'open'} · ${stream.total_calls || 0} calls · ${upstream}`,
    explorer,
  };
}

export function purchaseFromSolanaTopup(row: SolanaTopup): PurchaseRow | null {
  const sig = String(row.tx_signature || '').trim();
  if (!sig) return null;
  return {
    id: `topup-${sig}`,
    kind: 'solana-topup',
    category: SOLANA_TOPUP_CATEGORY,
    title: `${row.asset || 'SOL'} top-up`,
    amountLabel: formatUsd(Number(row.amount_usd || 0)),
    sizeLabel: formatUsd(Number(row.amount_usd || 0)),
    txType: 'Solana top-up',
    rail: 'solana-topup',
    railLabel: railLabel('solana-topup'),
    walletRole: 'user',
    walletLabel: 'User wallet',
    detail: `${row.chain || 'solana'} · on-chain credit`,
    explorer: [{ label: `Tx ${shortSig(sig)}`, href: explorerTx(sig) }],
  };
}

function parseLedgerRows(raw: string | null): LedgerPurchase[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is LedgerPurchase => (
      !!row && typeof row === 'object'
      && typeof (row as LedgerPurchase).id === 'string'
      && typeof (row as LedgerPurchase).amountUsd === 'number'
    ));
  } catch {
    return [];
  }
}

export function loadLedgerPurchases(): LedgerPurchase[] {
  const store = ledgerStore();
  if (!store) return [];
  try {
    let raw = store.getItem(LEDGER_KEY);
    if (!raw && typeof sessionStorage !== 'undefined' && store !== sessionStorage) {
      raw = sessionStorage.getItem(LEDGER_KEY);
      if (raw) {
        store.setItem(LEDGER_KEY, raw);
        sessionStorage.removeItem(LEDGER_KEY);
      }
    }
    return parseLedgerRows(raw);
  } catch {
    return [];
  }
}

export function recordLedgerPurchase(
  amountUsd = SHOP_CREDIT_USD,
  name = SHOP_ITEM_NAME,
): LedgerPurchase {
  const row: LedgerPurchase = {
    id: `ledger-${Date.now()}`,
    name,
    amountUsd,
    at: Date.now(),
  };
  try {
    const next = [...loadLedgerPurchases(), row];
    ledgerStore()?.setItem(LEDGER_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return row;
}

export function ledgerPurchaseRow(row: LedgerPurchase): PurchaseRow {
  return {
    id: row.id,
    kind: 'ledger',
    category: LEDGER_CATEGORY,
    title: row.name,
    amountLabel: formatUsd(row.amountUsd),
    sizeLabel: formatUsd(row.amountUsd),
    txType: 'Ledger credit',
    rail: 'ledger',
    railLabel: railLabel('ledger'),
    walletRole: 'ledger',
    walletLabel: 'Ledger · no chain wallet',
    detail: 'Proxy ledger · no Solana tx',
    explorer: [],
  };
}

export function vaultPurchases(apis: KeychainStoredApi[]): PurchaseRow[] {
  return apis.map((api) => {
    const card = formatStoredApiCard(api);
    const family = String(api.family || providerMeta(api.upstream).family || 'INFRA');
    return {
      id: `vault-${api.id}`,
      kind: 'vault-api' as const,
      category: `${family} APIs`,
      title: card.title,
      amountLabel: card.subtitle,
      sizeLabel: card.subtitle,
      txType: 'Stored API',
      rail: 'ledger',
      railLabel: railLabel('ledger'),
      walletRole: 'none',
      walletLabel: '—',
      detail: card.meta,
      explorer: [],
    };
  });
}

function txHref(row: PurchaseRow): string {
  return row.explorer.find((link) => link.href.includes('/tx/'))?.href || '';
}

export function mergePurchaseRows(rows: PurchaseRow[]): PurchaseRow[] {
  const seenId = new Set<string>();
  const seenTx = new Set<string>();
  const out: PurchaseRow[] = [];
  for (const row of rows) {
    if (seenId.has(row.id)) continue;
    const tx = txHref(row);
    if (tx && seenTx.has(tx)) continue;
    seenId.add(row.id);
    if (tx) seenTx.add(tx);
    out.push(row);
  }
  return out;
}

export function x402Purchases(): PurchaseRow[] {
  return [...BAZAAR_OFFERS, ...PAYAI_LIVE_EXTRAS].map((offer) => ({
    id: `x402-${offer.id}`,
    kind: 'x402' as const,
    category: X402_CATEGORY,
    title: offer.name,
    amountLabel: offer.amountLabel || '—',
    sizeLabel: offer.amountLabel || '—',
    txType: offer.status === 'LIVE' ? 'x402 HTTP 402' : 'x402 not surfaced',
    rail: 'x402' as const,
    railLabel: railLabel('x402'),
    walletRole: 'none',
    walletLabel: 'No KeyShield settle',
    detail: `${offer.method} · ${offer.detail}`,
    explorer: [{ label: offer.url, href: offer.url }],
  }));
}

export function listPurchases(
  _apis: KeychainStoredApi[] = [],
  extra: PurchaseRow[] = [],
): PurchaseRow[] {
  return mergePurchaseRows([
    ...loadMppReceiptHistory().map(mppPurchaseFromReceipt),
    ...extra,
    ledgerPurchaseRow(LAST_LIVE_LEDGER),
    ...loadLedgerPurchases().map(ledgerPurchaseRow),
    ...x402Purchases(),
  ]);
}

export async function fetchAccountPurchases(): Promise<PurchaseRow[]> {
  const rows: PurchaseRow[] = [];
  try {
    const sRes = await apiFetch('/mpp/streams');
    if (sRes.ok) {
      const body = await sRes.json() as { streams?: MppStreamPurchase[] };
      for (const stream of body.streams || []) {
        const row = purchaseFromMppStream(stream);
        if (row) rows.push(row);
      }
    }
  } catch {
    /* offline / unsigned */
  }
  try {
    const tRes = await apiFetch('/billing/topup-history?limit=50');
    if (tRes.ok) {
      const body = await tRes.json() as { topups?: SolanaTopup[] };
      for (const top of body.topups || []) {
        const row = purchaseFromSolanaTopup(top);
        if (row) rows.push(row);
      }
    }
  } catch {
    /* offline / unsigned */
  }
  return rows;
}

export function groupPurchases(rows: PurchaseRow[]): { category: string; items: PurchaseRow[] }[] {
  const map = new Map<string, PurchaseRow[]>();
  for (const row of rows) {
    const list = map.get(row.category) || [];
    list.push(row);
    map.set(row.category, list);
  }
  if (!map.has(ON_CHAIN_CATEGORY)) map.set(ON_CHAIN_CATEGORY, []);
  if (!map.has(LEDGER_CATEGORY)) map.set(LEDGER_CATEGORY, []);
  if (!map.has(X402_CATEGORY)) map.set(X402_CATEGORY, []);
  const known = PURCHASE_CATEGORY_ORDER.filter((cat) => map.has(cat));
  const extra = [...map.keys()].filter((cat) => !PURCHASE_CATEGORY_ORDER.includes(cat as typeof PURCHASE_CATEGORY_ORDER[number]));
  return [...known, ...extra].map((category) => ({ category, items: map.get(category) || [] }));
}

export function groupPurchasesByWallet(
  items: PurchaseRow[],
): { walletLabel: string; items: PurchaseRow[] }[] {
  const map = new Map<string, PurchaseRow[]>();
  for (const row of items) {
    const key = row.walletLabel || '—';
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()].map(([walletLabel, rows]) => ({ walletLabel, items: rows }));
}
