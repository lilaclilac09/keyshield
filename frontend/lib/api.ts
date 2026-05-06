/**
 * KeyShield API helpers — typed wrappers around `apiFetch`.
 *
 * These live separately from `auth.ts` so destructive flows
 * (account deletion, share grant/revoke) read like a contract instead
 * of being buried in component bodies. Each helper returns the parsed
 * JSON body or throws an Error with the server's `detail` message.
 */

import { apiFetch } from './auth';

// ─── Account deletion ──────────────────────────────────────────────────────

export interface DeleteAccountReport {
  vault_keys?:    number;
  agents?:        number;
  usage?:         { usage_log: number; user_balance: number; topup_tx: number };
  passkeys?:      number | string;
  x402_claims?:   string;
  shares?:        number | string;
  sessions?:      number;
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
  confirmation:    string;
  walletAddress?:  string;
  signature?:      string;   // base64 ed25519 signature
  challenge?:      string;
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
  id:           number;
  owner_id:     string;
  recipient_id: string;
  key_name:     string;
  expires_at:   number | null;
  created_at:   number;
}

export interface GrantShareInput {
  key_name:         string;
  recipient_user_id: string;
  expires_at?:       number | null;
}

/**
 * Grant share: server may return 501 if the build does not yet support
 * re-wrapped DEKs (passkey-vault dependency, see backend). Callers
 * should surface the 501 message verbatim — it explains the limitation
 * better than a generic error.
 */
export async function grantShare(
  input: GrantShareInput,
): Promise<{ ok: boolean; share?: ShareRow; status: number; detail?: string }> {
  const res = await apiFetch('/share/grant', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  // 501 = explicit "not yet implemented" — surface but don't throw.
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

// Re-export from auth so a single import works for all KeyShield API needs:
export { API_BASE, getToken, apiFetch } from './auth';
