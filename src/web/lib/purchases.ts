/**
 * Home purchases: every buy, grouped, with Solana explorer links.
 * On-chain MPP / ledger credit / stored vault APIs. Not Raydium / $X402 / $M32.
 */

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
import type { KeychainStoredApi } from './keychain';

export type PurchaseKind = 'on-chain-mpp' | 'ledger' | 'vault-api';

export type ExplorerLink = { label: string; href: string };

export type PurchaseRow = {
  id: string;
  kind: PurchaseKind;
  category: string;
  title: string;
  amountLabel: string;
  detail: string;
  explorer: ExplorerLink[];
};

export type LedgerPurchase = {
  id: string;
  name: string;
  amountUsd: number;
  at: number;
};

const LEDGER_KEY = 'ks_ledger_purchases';

export const ON_CHAIN_CATEGORY = 'On-chain MPP';
export const LEDGER_CATEGORY = 'Ledger credit';

export const PURCHASE_CATEGORY_ORDER = [
  ON_CHAIN_CATEGORY,
  LEDGER_CATEGORY,
  'AI APIs',
  'RPC APIs',
  'INFRA APIs',
  'GIT APIs',
  'DEX APIs',
] as const;

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
    detail: `${receipt.network}${cu}`,
    explorer: explorerLinksForReceipt(receipt),
  };
}

export function loadLedgerPurchases(): LedgerPurchase[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(LEDGER_KEY);
    if (!raw) return [];
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
    sessionStorage.setItem(LEDGER_KEY, JSON.stringify(next));
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
      detail: card.meta,
      explorer: [],
    };
  });
}

export function listPurchases(apis: KeychainStoredApi[] = []): PurchaseRow[] {
  return [
    ...loadMppReceiptHistory().map(mppPurchaseFromReceipt),
    ...loadLedgerPurchases().map(ledgerPurchaseRow),
    ...vaultPurchases(apis),
  ];
}

export function groupPurchases(rows: PurchaseRow[]): { category: string; items: PurchaseRow[] }[] {
  const map = new Map<string, PurchaseRow[]>();
  for (const row of rows) {
    const list = map.get(row.category) || [];
    list.push(row);
    map.set(row.category, list);
  }
  if (!map.has(LEDGER_CATEGORY)) map.set(LEDGER_CATEGORY, []);
  const known = PURCHASE_CATEGORY_ORDER.filter((cat) => map.has(cat));
  const extra = [...map.keys()].filter((cat) => !PURCHASE_CATEGORY_ORDER.includes(cat as typeof PURCHASE_CATEGORY_ORDER[number]));
  return [...known, ...extra].map((category) => ({ category, items: map.get(category) || [] }));
}
