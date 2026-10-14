/**
 * Payments ledger: every buy, grouped by human/agent then wallet.
 * Rails: Solana Devnet MPP / Solana top-up / ledger / x402. Tempo is archived.
 * Not Raydium / $X402 / $M32.
 */

import { apiFetch } from './auth';
import {
  explorerAddress,
  explorerTx,
  formatMicroUsdc,
  shortSig,
  type MppShopReceipt,
} from './mpp-receipt';
import { downloadMppReceipt, downloadTextFile, loadMppReceiptHistory } from './mpp-shop';
import { formatStoredApiCard, providerMeta } from './provider-catalog';
import { formatUsd, SHOP_CREDIT_USD, SHOP_ITEM_NAME } from './shop-demo';
import { BAZAAR_OFFERS, PAYAI_LIVE_EXTRAS } from './x402-bazaar';
import type { KeychainStoredApi } from './keychain';

export type PurchaseKind = 'on-chain-mpp' | 'ledger' | 'solana-topup' | 'vault-api' | 'x402' | 'tempo';

export type PurchaseRail = 'solana-mpp' | 'solana-topup' | 'ledger' | 'x402' | 'tempo';

export type ExplorerLink = { label: string; href: string };

export type WalletRole = 'user' | 'agent' | 'ledger' | 'none';

export type CallKind = 'on-chain tx' | 'API' | 'ledger credit' | 'x402 probe' | 'archived';

export type PurchaseRow = {
  id: string;
  kind: PurchaseKind;
  category: string;
  title: string;
  amountLabel: string;
  amountUsd: number;
  sizeLabel: string;
  txType: string;
  rail: PurchaseRail;
  railLabel: string;
  portal: string;
  callKind: CallKind;
  walletRole: WalletRole;
  walletAddress: string;
  walletLabel: string;
  detail: string;
  potentialUse: string;
  whatChanged: string;
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

export function portalLabel(rail: PurchaseRail): string {
  if (rail === 'solana-mpp') return 'Solana Devnet · MPP portal';
  if (rail === 'solana-topup') return 'Solana Devnet · top-up portal';
  if (rail === 'ledger') return 'KeyShield ledger portal';
  if (rail === 'x402') return 'x402 portal';
  return 'Tempo portal (archived)';
}

export function actorLabel(role: WalletRole): string {
  if (role === 'user') return 'Human';
  if (role === 'agent') return 'Agent';
  if (role === 'ledger') return 'Ledger';
  return 'Unassigned';
}

function shortWallet(addr: string): string {
  const text = String(addr || '').trim();
  if (text.length <= 12) return text || '—';
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function parseAmountUsd(label: string): number {
  const m = String(label || '').replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

function mppWhatChanged(receipt: MppShopReceipt): string {
  const parts: string[] = [];
  if (receipt.ownerUsdcBefore && receipt.ownerUsdcAfter) {
    parts.push(`Owner USDC ${receipt.ownerUsdcBefore} → ${receipt.ownerUsdcAfter}`);
  }
  if (receipt.escrowBefore && receipt.escrowAfter) {
    parts.push(`escrow ${receipt.escrowBefore} → ${receipt.escrowAfter}`);
  }
  if (receipt.platformBefore && receipt.platformAfter) {
    parts.push(`platform ${receipt.platformBefore} → ${receipt.platformAfter}`);
  }
  if (parts.length) return parts.join(' · ');
  return `${formatMicroUsdc(receipt.captureMicroUsdc)} USDC captured on Solana Devnet`;
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
  wallet?: string;
};

const LEDGER_KEY = 'ks_ledger_purchases';

export const ON_CHAIN_CATEGORY = 'On-chain MPP';
export const SOLANA_TOPUP_CATEGORY = 'Solana top-up';
export const LEDGER_CATEGORY = 'Ledger credit';
export const X402_CATEGORY = 'x402 probed';
export const TEMPO_CATEGORY = 'Tempo (archived)';

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
  TEMPO_CATEGORY,
] as const;

export const ROLE_ORDER: WalletRole[] = ['user', 'agent', 'ledger', 'none'];

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
  const amountUsd = receipt.captureMicroUsdc / 1_000_000;
  return {
    id: `mpp-${receipt.settleTx || receipt.openTx || receipt.sku}`,
    kind: 'on-chain-mpp',
    category: ON_CHAIN_CATEGORY,
    title: receipt.sku,
    amountLabel: `${formatMicroUsdc(receipt.captureMicroUsdc)} USDC`,
    amountUsd,
    sizeLabel: `${formatMicroUsdc(receipt.captureMicroUsdc)} USDC`,
    txType: 'On-chain MPP settle',
    rail: 'solana-mpp',
    railLabel: railLabel('solana-mpp'),
    portal: portalLabel('solana-mpp'),
    callKind: 'on-chain tx',
    walletRole: 'user',
    walletAddress: receipt.owner || '',
    walletLabel: receipt.owner ? `Human · ${shortWallet(receipt.owner)}` : 'Human wallet',
    detail: `${receipt.network}${cu}`,
    potentialUse: 'Pays a metered OpenRouter / proxy stream. Next agent call can settle from the open escrow.',
    whatChanged: mppWhatChanged(receipt),
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
  const agent = String(stream.agent_pubkey || '').trim();
  return {
    id: `mpp-stream-${stream.id}`,
    kind: 'on-chain-mpp',
    category: ON_CHAIN_CATEGORY,
    title: name,
    amountLabel: `${formatMicroUsdc(settled)} USDC`,
    amountUsd: settled / 1_000_000,
    sizeLabel: `${formatMicroUsdc(settled)} USDC`,
    // Only a stream with an on-chain settle signature is on-chain; otherwise it
    // was settled in the local ledger only.
    txType: sig ? 'On-chain MPP stream' : 'Local MPP stream (not on-chain)',
    rail: 'solana-mpp',
    railLabel: sig ? railLabel('solana-mpp') : 'Local ledger · MPP (not on-chain)',
    portal: portalLabel('solana-mpp'),
    callKind: sig ? 'on-chain tx' : 'API',
    walletRole: 'agent',
    walletAddress: agent,
    walletLabel: stream.agent_name
      ? `Agent · ${stream.agent_name}`
      : agent
        ? `Agent · ${shortWallet(agent)}`
        : 'Agent wallet',
    detail: `${stream.status || 'open'} · ${stream.total_calls || 0} calls · ${upstream}`,
    potentialUse: `Agent ${name} spends this stream on ${upstream} proxy calls.`,
    whatChanged: `${formatMicroUsdc(settled)} USDC settled · ${stream.total_calls || 0} recorded calls`,
    explorer,
  };
}

export function purchaseFromSolanaTopup(row: SolanaTopup): PurchaseRow | null {
  const sig = String(row.tx_signature || '').trim();
  if (!sig) return null;
  const wallet = String(row.wallet || '').trim();
  const usd = Number(row.amount_usd || 0);
  return {
    id: `topup-${sig}`,
    kind: 'solana-topup',
    category: SOLANA_TOPUP_CATEGORY,
    title: `${row.asset || 'SOL'} top-up`,
    amountLabel: formatUsd(usd),
    amountUsd: usd,
    sizeLabel: formatUsd(usd),
    txType: 'Solana top-up',
    rail: 'solana-topup',
    railLabel: railLabel('solana-topup'),
    portal: portalLabel('solana-topup'),
    callKind: 'on-chain tx',
    walletRole: 'user',
    walletAddress: wallet,
    walletLabel: wallet ? `Human · ${shortWallet(wallet)}` : 'Human wallet',
    detail: `${row.chain || 'solana'} · on-chain credit`,
    potentialUse: 'Credits the KeyShield ledger so later proxy / agent calls debit USDC instead of failing 402.',
    whatChanged: `${formatUsd(usd)} added to the prepaid ledger`,
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
    amountUsd: row.amountUsd,
    sizeLabel: formatUsd(row.amountUsd),
    txType: 'Ledger credit',
    rail: 'ledger',
    railLabel: railLabel('ledger'),
    portal: portalLabel('ledger'),
    callKind: 'ledger credit',
    walletRole: 'ledger',
    walletAddress: '',
    walletLabel: 'Ledger · no chain wallet',
    detail: 'Proxy ledger · no Solana tx',
    potentialUse: 'Prepaid KeyShield credit for agent / proxy calls after the included plan budget.',
    whatChanged: `${formatUsd(row.amountUsd)} credited to the off-chain ledger`,
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
      amountUsd: 0,
      sizeLabel: card.subtitle,
      txType: 'Stored API',
      rail: 'ledger',
      railLabel: railLabel('ledger'),
      portal: 'Vault API',
      callKind: 'API',
      walletRole: 'none',
      walletAddress: '',
      walletLabel: '—',
      detail: card.meta,
      potentialUse: `Call ${api.upstream} through /keychain/call or /vproxy/${api.upstream}.`,
      whatChanged: 'Key stored in the vault — no payment moved.',
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
    amountUsd: parseAmountUsd(offer.amountLabel || ''),
    sizeLabel: offer.amountLabel || '—',
    txType: offer.status === 'LIVE' ? 'x402 HTTP 402' : 'x402 not surfaced',
    rail: 'x402' as const,
    railLabel: railLabel('x402'),
    portal: portalLabel('x402'),
    callKind: 'x402 probe' as const,
    walletRole: 'none',
    walletAddress: '',
    walletLabel: 'No KeyShield settle',
    detail: `${offer.method} · ${offer.detail}`,
    potentialUse: offer.status === 'LIVE'
      ? 'HTTP 402 accept on Solana Devnet Circle USDC — not a KeyShield MPP settle.'
      : 'Probed only. Wrong chain/mint or not a KeyShield SKU.',
    whatChanged: 'No KeyShield wallet debit. Offer was classified, not captured.',
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
  if (!map.has(TEMPO_CATEGORY)) map.set(TEMPO_CATEGORY, []);
  const known = PURCHASE_CATEGORY_ORDER.filter((cat) => map.has(cat));
  const extra = [...map.keys()].filter((cat) => !PURCHASE_CATEGORY_ORDER.includes(cat as typeof PURCHASE_CATEGORY_ORDER[number]));
  return [...known, ...extra].map((category) => ({ category, items: map.get(category) || [] }));
}

export function groupPurchasesByWallet(
  items: PurchaseRow[],
): { walletLabel: string; walletAddress: string; items: PurchaseRow[] }[] {
  const map = new Map<string, PurchaseRow[]>();
  for (const row of items) {
    const key = row.walletAddress || row.walletLabel || '—';
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()].map(([walletAddress, rows]) => ({
    walletAddress,
    walletLabel: rows[0]?.walletLabel || shortWallet(walletAddress),
    items: rows,
  }));
}

export function groupPurchasesByRoleAndWallet(rows: PurchaseRow[]): {
  role: WalletRole;
  roleLabel: string;
  wallets: { walletAddress: string; walletLabel: string; items: PurchaseRow[] }[];
}[] {
  const byRole = new Map<WalletRole, PurchaseRow[]>();
  for (const role of ROLE_ORDER) byRole.set(role, []);
  for (const row of rows) {
    const list = byRole.get(row.walletRole) || [];
    list.push(row);
    byRole.set(row.walletRole, list);
  }
  return ROLE_ORDER
    .map((role) => ({
      role,
      roleLabel: actorLabel(role),
      wallets: groupPurchasesByWallet(byRole.get(role) || []),
    }))
    .filter((group) => group.wallets.length > 0 || group.role === 'user' || group.role === 'agent');
}

export function summarizeConsumption(rows: PurchaseRow[]): {
  humanUsd: number;
  agentUsd: number;
  ledgerUsd: number;
  humanCount: number;
  agentCount: number;
  ledgerCount: number;
} {
  let humanUsd = 0;
  let agentUsd = 0;
  let ledgerUsd = 0;
  let humanCount = 0;
  let agentCount = 0;
  let ledgerCount = 0;
  for (const row of rows) {
    if (row.walletRole === 'user') {
      humanUsd += row.amountUsd;
      humanCount += 1;
    } else if (row.walletRole === 'agent') {
      agentUsd += row.amountUsd;
      agentCount += 1;
    } else if (row.walletRole === 'ledger') {
      ledgerUsd += row.amountUsd;
      ledgerCount += 1;
    }
  }
  return { humanUsd, agentUsd, ledgerUsd, humanCount, agentCount, ledgerCount };
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function downloadPurchaseReceipt(row: PurchaseRow): void {
  if (row.receipt) {
    downloadMppReceipt(row.receipt, 'html');
    return;
  }
  const explorer = row.explorer.map((link) => `<a href="${esc(link.href)}">${esc(link.label)}</a>`).join('<br/>') || '—';
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>KeyShield receipt ${esc(row.id)}</title></head>
<body style="font-family:ui-sans-serif,system-ui,sans-serif;background:#0a0d1a;color:#e4e4e7;padding:32px">
  <p>${esc(row.callKind.toUpperCase())} · ${esc(row.railLabel)}</p>
  <h1>${esc(row.title)}</h1>
  <p>${esc(row.amountLabel)} · ${esc(row.portal)}</p>
  <p>Actor: ${esc(actorLabel(row.walletRole))} · ${esc(row.walletAddress || row.walletLabel)}</p>
  <p>Use: ${esc(row.potentialUse)}</p>
  <p>Changed: ${esc(row.whatChanged)}</p>
  <p>${explorer}</p>
</body></html>`;
  downloadTextFile(`keyshield-receipt-${row.id}.html`, html, 'text/html;charset=utf-8');
}
