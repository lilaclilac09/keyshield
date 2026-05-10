
// API client – typed fetch wrapper
// Path A: vault storage is client-side AES-256-GCM via Cloudflare Worker.
// Business logic (agents, sharing, billing, mpp, sessions) uses Python backend.

type ApiConfig = {
  baseUrl: string;
  getToken: () => string | null;
  onUnauthorized?: () => void;
};

let _config: ApiConfig = {
  baseUrl: import.meta?.env?.VITE_API_URL ?? 'http://localhost:8000',
  getToken: () => null,
};

export function configureApi(config: Partial<ApiConfig>) {
  _config = { ..._config, ...config };
}

export function getApiConfig() {
  return { ..._config };
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = _config.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string> ?? {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${_config.baseUrl}${path}`, { ...init, headers });

  if (res.status === 401) {
    _config.onUnauthorized?.();
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ============ Vault Endpoints ============
export async function getVaultList() {
  return request<Array<import('../types').VaultItem>>('/manage/vault');
}

export async function postStoreKey(payload: import('../types').StoreKeyPayload) {
  return request<{ id: string }>('/manage/store', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getDecryptKey(id: string) {
  return request<import('../types').DecryptedKey>(`/manage/decrypt/${encodeURIComponent(id)}`);
}

export async function deleteVaultKey(id: string) {
  return request<void>(`/manage/vault/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function updateVaultKey(id: string, payload: Partial<import('../types').StoreKeyPayload>) {
  return request<void>(`/manage/vault/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ============ Agent Endpoints ============
export async function getAgentsList() {
  return request<Array<import('../types').Agent>>('/agents');
}

export async function registerAgent(payload: import('../types').RegisterAgentPayload) {
  return request<{ id: string; agent_id: string }>('/agents', {
    method: 'POST',
    body: JSON.stringify({ name: payload.name }),
  });
}

export async function revokeAgent(id: string) {
  return request<void>(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getAgentWallets() {
  const resp = await request<{ wallets: Array<import('../types').AgentWallet> }>('/agents/wallets');
  return resp.wallets ?? [];
}

// ============ MPP Endpoints ============
export async function getMppStreams() {
  return request<Array<import('../types').MppStream>>('/mpp/streams');
}

export async function openMppStream(agentId: string, amountSol: number) {
  return request<{ stream_id: string; tx: string }>('/mpp/streams', {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, amount_sol: amountSol }),
  });
}

export async function settleMppStream(streamId: string) {
  return request<void>(`/mpp/streams/${encodeURIComponent(streamId)}/settle`, { method: 'POST' });
}

export async function closeMppStream(streamId: string) {
  return request<void>(`/mpp/streams/${encodeURIComponent(streamId)}/close`, { method: 'POST' });
}

export async function recordMppTx(streamId: string, txSig: string) {
  return request<void>(`/mpp/streams/${encodeURIComponent(streamId)}/record-tx`, {
    method: 'POST',
    body: JSON.stringify({ tx_signature: txSig }),
  });
}

export async function getMppUsage(streamId: string) {
  return request<Array<import('../types').MppUsageEntry>>(`/mpp/streams/${encodeURIComponent(streamId)}/usage`);
}

// ============ Billing Endpoints ============
export async function getBillingInfo() {
  return request<import('../types').BillingInfo>('/billing');
}

export async function getUsageHistory(limit = 50) {
  const resp = await request<{ history: Array<import('../types').MppUsageEntry> }>(`/billing/usage?limit=${limit}`);
  return resp.history ?? [];
}

// ============ Sharing Endpoints ============
export async function getShares() {
  return request<{ incoming: Array<import('../types').ShareRow>; outgoing: Array<import('../types').ShareRow> }>('/sharing');
}

export async function grantShare(payload: import('../types').GrantSharePayload) {
  return request<{ id: string }>('/sharing', {
    method: 'POST',
    body: JSON.stringify({
      vault_key_id: payload.vault_key_id,
      grantee_address: payload.grantee_address,
    }),
  });
}

export async function revokeShare(id: string) {
  return request<void>(`/sharing/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ============ Sessions ============
export async function getSessions() {
  return request<Array<import('../types').Session>>('/sessions');
}

export async function revokeSession(id: string) {
  return request<void>(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ============ Auth ============
export async function postAuthWalletChallenge() {
  return request<{ challenge: string }>('/auth/wallet/challenge');
}

export async function postAuthWalletVerify(wallet: string, signature: string, passphrase: string) {
  return request<import('../types').LoginToken>('/auth/wallet/verify', {
    method: 'POST',
    body: JSON.stringify({ wallet, signature, passphrase }),
  });
}

export async function postAuthPasskeyRegisterStart() {
  return request<Record<string, unknown>>('/auth/passkey/register-start');
}

export async function postAuthPasskeyRegisterFinish(credential: Record<string, unknown>) {
  return request<import('../types').LoginToken>('/auth/passkey/register-finish', {
    method: 'POST',
    body: JSON.stringify(credential),
  });
}

export async function postAuthPasskeyAuthStart() {
  return request<Record<string, unknown>>('/auth/passkey/auth-start');
}

export async function postAuthPasskeyAuthFinish(assertion: Record<string, unknown>) {
  return request<import('../types').LoginToken>('/auth/passkey/auth-finish', {
    method: 'POST',
    body: JSON.stringify(assertion),
  });
}

export async function postLogout() {
  return request<void>('/auth/logout', { method: 'POST' });
}

// ============ Health ============
export async function getHealth() {
  return request<import('../types').HealthCheck>('/health');
}

// ============ Developer ============
export async function getDeveloperEndpoints() {
  return request<Array<{ method: string; path: string; description: string }>>('/developer/endpoints');
}

// Backward-compat alias for components that import apiFetch
export { request as apiFetch };
