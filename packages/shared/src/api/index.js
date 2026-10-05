// API client – typed fetch wrapper
// In production, this is generated from OpenAPI spec via orval/openapi-typescript.
// Here we provide manual typed wrappers matching the spec.
let _config = {
    baseUrl: import.meta?.env?.VITE_API_URL ?? 'http://localhost:8000',
    getToken: () => null,
};
export function configureApi(config) {
    _config = { ..._config, ...config };
}
export function getApiConfig() {
    return { ..._config };
}
async function request(path, init) {
    const token = _config.getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
    };
    if (token)
        headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${_config.baseUrl}${path}`, { ...init, headers });
    if (res.status === 401) {
        _config.onUnauthorized?.();
        throw new Error('Unauthorized');
    }
    if (!res.ok) {
        const body = await res.text();
        throw new Error(`API ${res.status}: ${body}`);
    }
    if (res.status === 204)
        return undefined;
    return res.json();
}
// ============ Vault Endpoints ============
export async function getVaultList() {
    return request('/manage/vault');
}
export async function postStoreKey(payload) {
    return request('/manage/store', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export async function getDecryptKey(id) {
    return request(`/manage/decrypt/${encodeURIComponent(id)}`);
}
export async function deleteVaultKey(id) {
    return request(`/manage/vault/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export async function updateVaultKey(id, payload) {
    return request(`/manage/vault/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
    });
}
// ============ Agent Endpoints ============
export async function getAgentsList() {
    return request('/agents');
}
export async function registerAgent(payload) {
    return request('/agents', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export async function revokeAgent(id) {
    return request(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export async function getAgentWallets() {
    return request('/agents/wallets');
}
// ============ MPP Endpoints ============
export async function getMppStreams() {
    return request('/mpp/streams');
}
export async function openMppStream(agentId, amountSol) {
    return request('/mpp/open', {
        method: 'POST',
        body: JSON.stringify({ agent_id: agentId, amount_sol: amountSol }),
    });
}
export async function settleMppStream(streamId) {
    return request(`/mpp/streams/${encodeURIComponent(streamId)}/settle`, { method: 'POST' });
}
export async function closeMppStream(streamId) {
    return request(`/mpp/streams/${encodeURIComponent(streamId)}/close`, { method: 'POST' });
}
export async function recordMppTx(streamId, txSig, extra) {
    return request(`/mpp/streams/${encodeURIComponent(streamId)}/record-tx`, {
        method: 'POST',
        body: JSON.stringify({
            tx_signature: txSig,
            streamPda: extra?.streamPda,
            streamUsdcAta: extra?.streamUsdcAta,
        }),
    });
}
export async function getMppUsage(streamId) {
    const data = await request(`/mpp/streams/${encodeURIComponent(streamId)}/usage`);
    return Array.isArray(data) ? data : (data.usage ?? []);
}
// ============ Billing Endpoints ============
export async function getBillingInfo() {
    return request('/billing');
}
export async function getUsageHistory(limit = 50) {
    return request(`/billing/usage?limit=${limit}`);
}
// ============ Sharing Endpoints ============
export async function getShares() {
    return request('/sharing');
}
export async function grantShare(payload) {
    return request('/sharing', {
        method: 'POST',
        body: JSON.stringify(payload),
    });
}
export async function revokeShare(id) {
    return request(`/sharing/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
// ============ Sessions ============
export async function getSessions() {
    return request('/sessions');
}
export async function revokeSession(id) {
    return request(`/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
// ============ Auth ============
export async function postAuthWalletChallenge() {
    return request('/auth/wallet/challenge');
}
export async function postAuthWalletVerify(wallet, signature, passphrase) {
    return request('/auth/wallet/verify', {
        method: 'POST',
        body: JSON.stringify({ wallet, signature, passphrase }),
    });
}
export async function postAuthPasskeyRegisterStart() {
    return request('/auth/passkey/register-start');
}
export async function postAuthPasskeyRegisterFinish(credential) {
    return request('/auth/passkey/register-finish', {
        method: 'POST',
        body: JSON.stringify(credential),
    });
}
export async function postAuthPasskeyAuthStart() {
    return request('/auth/passkey/auth-start');
}
export async function postAuthPasskeyAuthFinish(assertion) {
    return request('/auth/passkey/auth-finish', {
        method: 'POST',
        body: JSON.stringify(assertion),
    });
}
export async function postLogout() {
    return request('/auth/logout', { method: 'POST' });
}
// ============ Health ============
export async function getHealth() {
    return request('/health');
}
// ============ Developer ============
export async function getDeveloperEndpoints() {
    return request('/developer/endpoints');
}
//# sourceMappingURL=index.js.map