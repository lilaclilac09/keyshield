/**
 * Home shop buy: autosign-open 5.00 USDC, then capture 2.00 (ix 26).
 * Ledger $0.10 is a different button — this path is on-chain Devnet.
 */

import { Keypair } from '@solana/web3.js';
import { apiFetch, getToken } from './auth';
import { autosignOpenStream, captureMppStream } from './api';
import { signCaptureMac } from './mpp-capture';
import {
  LAST_LIVE_MPP_RECEIPT,
  MPP_SHOP_CAPTURE_MICRO,
  MPP_SHOP_OPEN_MICRO,
  MPP_SHOP_SKU,
  type MppShopReceipt,
  isMppShopReceipt,
  receiptFilename,
  renderMppReceiptHtml,
} from './mpp-receipt';

const RECEIPT_STORAGE_KEY = 'ks_mpp_shop_receipt';
const RECEIPT_HISTORY_KEY = 'ks_mpp_shop_receipts';

type StreamRow = {
  id?: number;
  artifact_hash?: string;
  just_settled_micro_usdc?: number;
  settled_micro_usdc?: number;
  stream_pda?: string | null;
  stream_usdc_ata?: string | null;
  on_chain_signature?: string | null;
};

type CaptureBody = {
  stream?: StreamRow;
  receipt?: { signature?: string; micro_usdc?: number; stream_pda?: string | null };
};

export function loadStoredMppReceipt(): MppShopReceipt {
  if (typeof sessionStorage === 'undefined') return LAST_LIVE_MPP_RECEIPT;
  try {
    const raw = sessionStorage.getItem(RECEIPT_STORAGE_KEY);
    if (!raw) return LAST_LIVE_MPP_RECEIPT;
    const parsed = JSON.parse(raw) as unknown;
    if (isMppShopReceipt(parsed) && parsed.settleTx) return parsed;
  } catch {
    /* keep last live */
  }
  return LAST_LIVE_MPP_RECEIPT;
}

export function storeMppReceipt(receipt: MppShopReceipt): void {
  try {
    sessionStorage.setItem(RECEIPT_STORAGE_KEY, JSON.stringify(receipt));
    const key = receipt.settleTx || receipt.openTx || receipt.sku;
    const next = loadMppReceiptHistory().filter(
      (row) => (row.settleTx || row.openTx || row.sku) !== key,
    );
    next.push(receipt);
    sessionStorage.setItem(RECEIPT_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

function receiptKey(row: MppShopReceipt): string {
  return row.settleTx || row.openTx || row.sku;
}

/** Every on-chain MPP buy we know about, including the last live Devnet receipt. */
export function loadMppReceiptHistory(): MppShopReceipt[] {
  const seen = new Set<string>();
  const out: MppShopReceipt[] = [];
  const add = (row: MppShopReceipt) => {
    const key = receiptKey(row);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(row);
  };
  add(LAST_LIVE_MPP_RECEIPT);
  if (typeof sessionStorage === 'undefined') return out;
  try {
    const raw = sessionStorage.getItem(RECEIPT_HISTORY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          if (isMppShopReceipt(row)) add(row);
        }
      }
    }
  } catch {
    /* keep seed */
  }
  add(loadStoredMppReceipt());
  return out;
}

export async function buyMppShopSku(): Promise<MppShopReceipt> {
  const token = getToken();
  if (!token) throw new Error('Sign in first — shop capture needs KS_TOKEN');

  const agent = Keypair.generate().publicKey.toBase58();
  const opened = await autosignOpenStream({
    agentPubkey: agent,
    agentName: 'keyshield-shop-big',
    upstream: 'openrouter',
    maxTotalMicroUsdc: MPP_SHOP_OPEN_MICRO,
    ratePerCallMicroUsdc: MPP_SHOP_CAPTURE_MICRO,
    ratePerTokenMicroUsdc: 0,
    settlementIntervalSecs: 60,
  });
  const stream = (opened.stream || {}) as StreamRow;
  const streamId = Number(stream.id);
  if (!streamId) throw new Error('autosign open returned no stream id');

  const hold = await apiFetch(`/mpp/streams/${streamId}/hold`, {
    method: 'POST',
    body: JSON.stringify({
      estimateMicroUsdc: MPP_SHOP_CAPTURE_MICRO,
      upstream: 'openrouter',
    }),
  });
  if (!hold.ok && hold.status !== 409) {
    const err = await hold.json().catch(() => ({ detail: `hold HTTP ${hold.status}` }));
    throw new Error((err as { detail?: string }).detail || `hold HTTP ${hold.status}`);
  }

  const recorded = await apiFetch(`/mpp/streams/${streamId}/record`, {
    method: 'POST',
    body: JSON.stringify({
      calls: 1,
      tokens: 0,
      status_code: 200,
      body: {
        id: `chatcmpl-shop-${Date.now()}`,
        choices: [{ message: { role: 'assistant', content: 'KeyShield MPP shop capture: 2.00 USDC' } }],
        usage: { total_tokens: 64 },
      },
    }),
  });
  if (!recorded.ok) throw new Error(`record HTTP ${recorded.status}`);
  const recBody = await recorded.json() as { stream?: StreamRow; artifact_hash?: string };
  const artifact = recBody.stream?.artifact_hash || recBody.artifact_hash;
  if (!artifact) throw new Error('record returned no artifact_hash');

  const mac = await signCaptureMac(token, artifact);
  const cap = await captureMppStream(streamId, artifact, mac) as CaptureBody;
  const capStream = cap.stream || {};
  const receipt: MppShopReceipt = {
    sku: MPP_SHOP_SKU,
    network: 'solana-devnet',
    openTx: typeof opened.txSignature === 'string' ? opened.txSignature : null,
    openSlot: null,
    settleTx: cap.receipt?.signature || capStream.on_chain_signature || null,
    settleSlot: null,
    settleCu: null,
    settleErr: null,
    owner: typeof opened.ownerPubkey === 'string' ? opened.ownerPubkey : LAST_LIVE_MPP_RECEIPT.owner,
    streamPda: (opened.streamPda as string | undefined) || capStream.stream_pda || cap.receipt?.stream_pda || null,
    streamAta: (opened.streamUsdcAta as string | undefined) || capStream.stream_usdc_ata || null,
    captureMicroUsdc: Number(capStream.just_settled_micro_usdc || cap.receipt?.micro_usdc || MPP_SHOP_CAPTURE_MICRO),
    ownerUsdcBefore: null,
    ownerUsdcAfter: null,
    escrowBefore: formatOpenUi(MPP_SHOP_OPEN_MICRO),
    escrowAfter: formatOpenUi(MPP_SHOP_OPEN_MICRO - MPP_SHOP_CAPTURE_MICRO),
    platformBefore: null,
    platformAfter: null,
  };
  storeMppReceipt(receipt);
  return receipt;
}

function formatOpenUi(micro: number): string {
  return (micro / 1_000_000).toFixed(2);
}

export function downloadTextFile(filename: string, body: string, mime: string): void {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadMppReceipt(receipt: MppShopReceipt, kind: 'html' | 'json' = 'html'): void {
  if (kind === 'json') {
    downloadTextFile(receiptFilename(receipt, 'json'), JSON.stringify(receipt, null, 2), 'application/json');
    return;
  }
  downloadTextFile(receiptFilename(receipt, 'html'), renderMppReceiptHtml(receipt), 'text/html;charset=utf-8');
}

export function openMppReceiptPrint(receipt: MppShopReceipt): void {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) {
    downloadMppReceipt(receipt, 'html');
    return;
  }
  popup.document.write(renderMppReceiptHtml(receipt));
  popup.document.close();
}
