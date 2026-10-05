/**
 * KeyShield API helpers — typed wrappers around `apiFetch`.
 */

import { apiFetch } from './auth';
import type { BuildTxResponse } from './solana';

// ─── Account deletion ──────────────────────────────────────────────────────

export interface DeleteAccountReport {
  vault_keys?: number;
  agents?: number;
  usage?: { usage_log: number; user_balance: number; topup_tx: number };
  passkeys?: number | string;
  x402_claims?: string;
  shares?: number | string;
  sessions?: number;
}

export async function fetchDeleteAccountChallenge(): Promise<{ challenge: string; nonce: string }> {
  const res = await apiFetch('/auth/delete-account-challenge');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch challenge' }));
    throw new Error((err as { detail: string }).detail ?? 'Failed to fetch challenge');
  }
  return res.json();
}

export interface DeleteAccountInput {
  confirmation: string;
  walletAddress?: string;
  signature?: string;
  challenge?: string;
}

export async function deleteAccount(input: DeleteAccountInput): Promise<{ ok: boolean; report: DeleteAccountReport }> {
  const res = await apiFetch('/auth/delete-account', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Account deletion failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Account deletion failed');
  }
  return res.json();
}

// ─── Sharing ───────────────────────────────────────────────────────────────

export interface ShareRow {
  id: number;
  owner_id: string;
  recipient_id: string;
  key_name: string;
  expires_at: number | null;
  created_at: number;
}

export interface GrantShareInput {
  key_name: string;
  recipient_user_id: string;
  expires_at?: number | null;
}

function normalizeShare(raw: Record<string, unknown>): ShareRow {
  return {
    id: Number(raw.id),
    owner_id: String(raw.owner_id ?? ''),
    recipient_id: String(raw.recipient_id ?? raw.grantee_address ?? ''),
    key_name: String(raw.key_name ?? raw.vault_key_id ?? ''),
    expires_at: (raw.expires_at as number | null | undefined) ?? null,
    created_at: Number(raw.created_at ?? 0),
  };
}

export async function grantShare(
  input: GrantShareInput,
): Promise<{ ok: boolean; share?: ShareRow; status: number; detail?: string }> {
  const res = await apiFetch('/share/grant', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (res.status === 501) {
    const body = await res.json().catch(() => ({ detail: 'sharing not implemented' }));
    return { ok: false, status: 501, detail: (body as { detail?: string }).detail ?? 'sharing not implemented' };
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Share failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Share failed');
  }
  const data = await res.json();
  const share = data.share
    ? normalizeShare(data.share as Record<string, unknown>)
    : undefined;
  return { ok: true, status: 200, share };
}

export async function listIncomingShares(): Promise<ShareRow[]> {
  const res = await apiFetch('/share/incoming');
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.shares ?? []) as Record<string, unknown>[]).map(normalizeShare);
}

export async function listOutgoingShares(): Promise<ShareRow[]> {
  const res = await apiFetch('/share/outgoing');
  if (!res.ok) return [];
  const data = await res.json();
  return ((data.shares ?? []) as Record<string, unknown>[]).map(normalizeShare);
}

export async function revokeShare(shareId: number): Promise<void> {
  const res = await apiFetch(`/share/${shareId}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Revoke failed' }));
    throw new Error((err as { detail: string }).detail ?? 'Revoke failed');
  }
}

// ─── MPP wallet sign-off ──────────────────────────────────────────────────

export interface BuildOpenTxBody {
  ownerPubkey: string;
  streamPda: string;
  bump: number;
  usdcAta: string;
  maxTotalMicroUsdc: number;
  costPerUnitMicroUsdc?: number;
  maxRateUsdPerMinBits?: number;
  settlementIntervalSecsOverride?: number;
}

export async function openMppStreamRow(body: {
  agentPubkey: string;
  agentName?: string;
  upstream: string;
  maxTotalMicroUsdc: number;
  ratePerTokenMicroUsdc?: number;
  ratePerCallMicroUsdc?: number;
  settlementIntervalSecs?: number;
  streamPda?: string;
  streamUsdcAta?: string;
}): Promise<{ stream: { id: number } }> {
  const r = await apiFetch('/mpp/streams', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'open stream failed' }));
    throw new Error((err as { detail: string }).detail ?? 'open stream failed');
  }
  return r.json();
}

export async function buildVaultCreateTx(ownerPubkey: string): Promise<BuildTxResponse> {
  const r = await apiFetch('/mpp/vault/build-create-tx', {
    method: 'POST',
    body: JSON.stringify({ ownerPubkey }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'build-create-tx failed' }));
    throw new Error((err as { detail: string }).detail ?? 'build-create-tx failed');
  }
  return r.json();
}

export async function buildVaultEnablePaymentsTx(ownerPubkey: string): Promise<BuildTxResponse> {
  const r = await apiFetch('/mpp/vault/build-enable-payments-tx', {
    method: 'POST',
    body: JSON.stringify({ ownerPubkey }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'build-enable-payments-tx failed' }));
    throw new Error((err as { detail: string }).detail ?? 'build-enable-payments-tx failed');
  }
  return r.json();
}

export async function buildVaultEnablePaymentsTxForVault(
  ownerPubkey: string,
  vaultPda: string,
): Promise<BuildTxResponse> {
  const r = await apiFetch('/mpp/vault/build-enable-payments-tx', {
    method: 'POST',
    body: JSON.stringify({ ownerPubkey, vaultPda }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'build-enable-payments-tx failed' }));
    throw new Error((err as { detail: string }).detail ?? 'build-enable-payments-tx failed');
  }
  return r.json();
}

export async function buildVaultGrantTx(
  ownerPubkey: string,
  agentPubkey: string,
  maxSpendMicroUsdc: number,
): Promise<BuildTxResponse> {
  return buildVaultGrantTxForVault(ownerPubkey, agentPubkey, maxSpendMicroUsdc);
}

export async function buildVaultGrantTxForVault(
  ownerPubkey: string,
  agentPubkey: string,
  maxSpendMicroUsdc: number,
  vaultPda?: string,
): Promise<BuildTxResponse> {
  const r = await apiFetch('/mpp/vault/build-grant-tx', {
    method: 'POST',
    body: JSON.stringify({
      ownerPubkey,
      agentPubkey,
      vaultPda,
      paymentStreamEnabled: true,
      maxSpendMicroUsdc,
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'build-grant-tx failed' }));
    throw new Error((err as { detail: string }).detail ?? 'build-grant-tx failed');
  }
  return r.json();
}

export async function fetchCapturePrep(streamId: number): Promise<{
  artifactHash: string;
  debitMicroUsdc: number;
  nextSeq: number;
  streamPda: string | null;
  bindingHash: string | null;
  lastSettledSeq: number;
}> {
  const r = await apiFetch(`/mpp/streams/${streamId}/capture-prep`);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'capture-prep failed' }));
    throw new Error((err as { detail?: string }).detail ?? 'capture-prep failed');
  }
  return r.json();
}

export async function closeMppStream(streamId: number): Promise<Record<string, unknown>> {
  const r = await apiFetch(`/mpp/streams/${streamId}/close`, { method: 'POST' });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'close failed' }));
    throw new Error((err as { detail?: string }).detail ?? 'close failed');
  }
  return r.json();
}

export async function captureMppStream(
  streamId: number,
  artifactHash: string,
  signatureHex: string,
  owner?: { ownerPubkey: string; ownerSignature: string },
): Promise<Record<string, unknown>> {
  const r = await apiFetch(`/mpp/streams/${streamId}/capture`, {
    method: 'POST',
    body: JSON.stringify({
      artifactHash,
      signature: signatureHex,
      ownerPubkey: owner?.ownerPubkey,
      ownerSignature: owner?.ownerSignature,
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'capture failed' }));
    throw new Error((err as { detail: string }).detail ?? 'capture failed');
  }
  return r.json();
}

export async function buildOpenStreamTx(
  streamId: number,
  body: BuildOpenTxBody,
): Promise<BuildTxResponse> {
  const r = await apiFetch(`/mpp/streams/${streamId}/build-open-tx`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'build-open-tx failed' }));
    throw new Error((err as { detail: string }).detail ?? 'build-open-tx failed');
  }
  return r.json();
}

export interface BuildWithdrawTxBody {
  ownerPubkey: string;
  streamPda: string;
  streamAta: string;
  ownerAta: string;
  withdrawAmountMicroUsdc: number;
}

export async function buildWithdrawTx(
  streamId: number,
  body: BuildWithdrawTxBody,
): Promise<BuildTxResponse> {
  const r = await apiFetch(`/mpp/streams/${streamId}/build-withdraw-tx`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'build-withdraw-tx failed' }));
    throw new Error((err as { detail: string }).detail ?? 'build-withdraw-tx failed');
  }
  return r.json();
}

export async function recordMppTxSignature(
  streamId: number,
  txSignature: string,
  extra?: { streamPda?: string; streamUsdcAta?: string },
): Promise<void> {
  const r = await apiFetch(`/mpp/streams/${streamId}/record-tx`, {
    method: 'POST',
    body: JSON.stringify({
      tx_signature: txSignature,
      streamPda: extra?.streamPda,
      streamUsdcAta: extra?.streamUsdcAta,
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'record-tx failed' }));
    throw new Error((err as { detail: string }).detail ?? 'record-tx failed');
  }
}

export async function autosignOpenStream(body: {
  agentPubkey: string;
  agentName?: string;
  upstream: string;
  maxTotalMicroUsdc: number;
  ratePerTokenMicroUsdc?: number;
  ratePerCallMicroUsdc?: number;
  settlementIntervalSecs?: number;
}): Promise<Record<string, unknown>> {
  const r = await apiFetch('/mpp/autosign/open', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'autosign open failed' }));
    throw new Error((err as { detail: string }).detail ?? 'autosign open failed');
  }
  return r.json();
}

export async function storeUpstreamKey(
  upstream: string,
  apiKey: string,
): Promise<{ id: string }> {
  const r = await apiFetch('/manage/store', {
    method: 'POST',
    body: JSON.stringify({ upstream, apiKey, name: `${upstream} key` }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'store failed' }));
    throw new Error((err as { detail?: string; error?: string }).detail
      ?? (err as { error?: string }).error
      ?? 'store failed');
  }
  return r.json();
}

export async function demoMeterStream(
  streamId: number,
  prompt = 'KeyShield demo ping',
): Promise<Record<string, unknown>> {
  const r = await apiFetch(`/mpp/streams/${streamId}/demo-meter`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'demo-meter failed' }));
    throw new Error((err as { detail?: string }).detail ?? 'demo-meter failed');
  }
  return r.json();
}

export async function getMppStreamUsage(streamId: number): Promise<unknown[]> {
  const r = await apiFetch(`/mpp/streams/${streamId}/usage`);
  if (!r.ok) return [];
  const data = await r.json();
  if (Array.isArray(data)) return data;
  return data.usage ?? [];
}

export interface SolQuote {
  amount_usd: number;
  amount_sol: number;
  amount_lamports: number;
  sol_usd_price: number;
  payment_address: string;
  memo?: string | null;
  cluster?: string;
}

export async function fetchSolQuote(amountUsd: number): Promise<SolQuote> {
  const r = await apiFetch(`/billing/sol-quote?amount_usd=${encodeURIComponent(String(amountUsd))}`);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'sol-quote failed' }));
    throw new Error((err as { detail?: string }).detail ?? 'sol-quote failed');
  }
  return r.json();
}

export async function creditSolanaTopup(body: {
  txSignature: string;
  expectedAmountUsd?: number;
  memo?: string | null;
  wallet?: string;
}): Promise<{ credited_usd: number; balance_usd: number; tx_signature: string }> {
  const r = await apiFetch('/billing/topup-solana', {
    method: 'POST',
    body: JSON.stringify({
      tx_signature: body.txSignature,
      expected_amount_usd: body.expectedAmountUsd,
      memo: body.memo,
      wallet: body.wallet,
    }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'topup-solana failed' }));
    throw new Error((err as { detail?: string }).detail ?? 'topup-solana failed');
  }
  return r.json();
}

export async function creditUsdcTopup(
  txSignature: string,
  network = 'devnet',
  wallet?: string,
): Promise<{ credited_usd: number; balance_usd: number }> {
  const r = await apiFetch('/billing/topup-solana-usdc', {
    method: 'POST',
    body: JSON.stringify({ tx_signature: txSignature, network, wallet }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'topup-solana-usdc failed' }));
    throw new Error((err as { detail?: string }).detail ?? 'topup-solana-usdc failed');
  }
  return r.json();
}

export async function listTopupHistory(): Promise<unknown[]> {
  const r = await apiFetch('/billing/topup-history');
  if (!r.ok) return [];
  const data = await r.json();
  return data.topups ?? [];
}

export async function autosignWithdrawStream(
  streamId: number,
  withdrawAmountMicroUsdc?: number,
): Promise<Record<string, unknown>> {
  const r = await apiFetch(`/mpp/streams/${streamId}/submit-withdraw-tx`, {
    method: 'POST',
    body: JSON.stringify(
      withdrawAmountMicroUsdc == null ? {} : { withdrawAmountMicroUsdc },
    ),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'autosign withdraw failed' }));
    throw new Error((err as { detail: string }).detail ?? 'autosign withdraw failed');
  }
  return r.json();
}

// Re-export
export { API_BASE, getToken, apiFetch } from './auth';
