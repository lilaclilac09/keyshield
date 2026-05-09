/**
 * KeyShield API helpers — typed wrappers around `apiFetch`.
 */

import { apiFetch } from "./auth";
import type { BuildTxResponse } from "./solana";

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
  return { ok: true, status: 200, share: data.share };
}

export async function listIncomingShares(): Promise<ShareRow[]> {
  const res = await apiFetch('/share/incoming');
  if (!res.ok) return [];
  const data = await res.json();
  return (data.shares ?? []) as ShareRow[];
}

export async function listOutgoingShares(): Promise<ShareRow[]> {
  const res = await apiFetch('/share/outgoing');
  if (!res.ok) return [];
  const data = await res.json();
  return (data.shares ?? []) as ShareRow[];
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

export async function recordMppTxSignature(streamId: number, txSignature: string): Promise<void> {
  const r = await apiFetch(`/mpp/streams/${streamId}/record-tx`, {
    method: 'POST',
    body: JSON.stringify({ tx_signature: txSignature }),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: 'record-tx failed' }));
    throw new Error((err as { detail: string }).detail ?? 'record-tx failed');
  }
}

// Re-export
export { API_BASE, getToken, apiFetch } from "./auth";
