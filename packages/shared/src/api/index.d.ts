type ApiConfig = {
    baseUrl: string;
    getToken: () => string | null;
    onUnauthorized?: () => void;
};
export declare function configureApi(config: Partial<ApiConfig>): void;
export declare function getApiConfig(): {
    baseUrl: string;
    getToken: () => string | null;
    onUnauthorized?: () => void;
};
export declare function getVaultList(): Promise<{
    type: "api_key" | "password" | "note" | "env" | "ssh_key";
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
    tags: string[];
    upstream?: string | null | undefined;
    expires_at?: string | null | undefined;
    masked_value?: string | null | undefined;
}[]>;
export declare function postStoreKey(payload: import('../types').StoreKeyPayload): Promise<{
    id: string;
}>;
export declare function getDecryptKey(id: string): Promise<{
    value: string;
    id: string;
    note?: string | undefined;
    ssh_public?: string | undefined;
    ssh_private?: string | undefined;
}>;
export declare function deleteVaultKey(id: string): Promise<void>;
export declare function updateVaultKey(id: string, payload: Partial<import('../types').StoreKeyPayload>): Promise<void>;
export declare function getAgentsList(): Promise<{
    id: string;
    name: string;
    created_at: string;
    agent_id: string;
    is_active: boolean;
    description?: string | null | undefined;
    last_seen_at?: string | null | undefined;
    rate_limit_rpm?: number | null | undefined;
}[]>;
export declare function registerAgent(payload: import('../types').RegisterAgentPayload): Promise<{
    id: string;
}>;
export declare function revokeAgent(id: string): Promise<void>;
export declare function getAgentWallets(): Promise<{
    id: string;
    address: string;
    balance_sol: number;
}[]>;
export declare function getMppStreams(): Promise<{
    status: "active" | "paused" | "closed";
    id: string;
    name: string;
    created_at: string;
    agent_id: string;
    stream_address: string;
    total_deposited_sol: number;
    total_withdrawn_sol: number;
    total_usage_usd: number;
}[]>;
export declare function openMppStream(agentId: string, amountSol: number): Promise<{
    stream_id: string;
    tx: string;
}>;
export declare function settleMppStream(streamId: string): Promise<void>;
export declare function closeMppStream(streamId: string): Promise<void>;
export declare function recordMppTx(streamId: string, txSig: string, extra?: {
    streamPda?: string;
    streamUsdcAta?: string;
}): Promise<void>;
export declare function getMppUsage(streamId: string): Promise<{
    id: string;
    agent_id: string;
    stream_id: string;
    amount_usd: number;
    tokens_in: number;
    tokens_out: number;
    timestamp: string;
    model?: string | undefined;
}[]>;
export declare function getBillingInfo(): Promise<{
    balance_sol: number;
    balance_usd: number;
    total_spent_usd: number;
    total_keys_proxied: number;
}>;
export declare function getUsageHistory(limit?: number): Promise<{
    id: string;
    agent_id: string;
    stream_id: string;
    amount_usd: number;
    tokens_in: number;
    tokens_out: number;
    timestamp: string;
    model?: string | undefined;
}[]>;
export declare function getShares(): Promise<{
    incoming: Array<import("../types").ShareRow>;
    outgoing: Array<import("../types").ShareRow>;
}>;
export declare function grantShare(payload: import('../types').GrantSharePayload): Promise<{
    id: string;
}>;
export declare function revokeShare(id: string): Promise<void>;
export declare function getSessions(): Promise<{
    id: string;
    created_at: string;
    ip_address: string;
    user_agent: string;
    last_active_at: string;
    is_current: boolean;
}[]>;
export declare function revokeSession(id: string): Promise<void>;
export declare function postAuthWalletChallenge(): Promise<{
    challenge: string;
}>;
export declare function postAuthWalletVerify(wallet: string, signature: string, passphrase: string): Promise<{
    expires_at: string;
    token: string;
    wallet_address?: string | null | undefined;
}>;
export declare function postAuthPasskeyRegisterStart(): Promise<Record<string, unknown>>;
export declare function postAuthPasskeyRegisterFinish(credential: Record<string, unknown>): Promise<{
    expires_at: string;
    token: string;
    wallet_address?: string | null | undefined;
}>;
export declare function postAuthPasskeyAuthStart(): Promise<Record<string, unknown>>;
export declare function postAuthPasskeyAuthFinish(assertion: Record<string, unknown>): Promise<{
    expires_at: string;
    token: string;
    wallet_address?: string | null | undefined;
}>;
export declare function postLogout(): Promise<void>;
export declare function getHealth(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    version: string;
    latency_ms?: number | undefined;
}>;
export declare function getDeveloperEndpoints(): Promise<{
    method: string;
    path: string;
    description: string;
}[]>;
export {};
//# sourceMappingURL=index.d.ts.map