import { z } from 'zod';
// ============ Vault Types ============
export const VaultItemTypeSchema = z.enum(['api_key', 'password', 'note', 'env', 'ssh_key']);
export const VaultItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: VaultItemTypeSchema,
    upstream: z.string().optional().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    expires_at: z.string().optional().nullable(),
    masked_value: z.string().optional().nullable(),
    tags: z.array(z.string()).default([]),
});
export const StoreKeyPayloadSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    type: VaultItemTypeSchema,
    upstream: z.string().optional(),
    value: z.string().min(1, 'Value is required'),
    expires_at: z.string().optional(),
    tags: z.array(z.string()).default([]),
    note: z.string().optional(),
    ssh_public: z.string().optional(),
    ssh_private: z.string().optional(),
});
export const DecryptedKeySchema = z.object({
    id: z.string(),
    value: z.string(),
    note: z.string().optional(),
    ssh_public: z.string().optional(),
    ssh_private: z.string().optional(),
});
// ============ Agent Types ============
export const AgentSchema = z.object({
    id: z.string(),
    name: z.string(),
    agent_id: z.string(),
    description: z.string().optional().nullable(),
    created_at: z.string(),
    last_seen_at: z.string().optional().nullable(),
    is_active: z.boolean(),
    rate_limit_rpm: z.number().optional().nullable(),
});
export const RegisterAgentPayloadSchema = z.object({
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional(),
    rate_limit_rpm: z.number().min(1).max(10000).optional(),
});
// ============ MPP Types ============
export const MppStreamSchema = z.object({
    id: z.string(),
    agent_id: z.string(),
    name: z.string(),
    stream_address: z.string(),
    total_deposited_sol: z.number(),
    total_withdrawn_sol: z.number(),
    total_usage_usd: z.number(),
    status: z.enum(['active', 'paused', 'closed']),
    created_at: z.string(),
});
export const MppUsageEntrySchema = z.object({
    id: z.string(),
    stream_id: z.string(),
    agent_id: z.string(),
    amount_usd: z.number(),
    tokens_in: z.number(),
    tokens_out: z.number(),
    model: z.string().optional(),
    timestamp: z.string(),
});
// ============ Billing Types ============
export const BillingInfoSchema = z.object({
    balance_sol: z.number(),
    balance_usd: z.number(),
    total_spent_usd: z.number(),
    total_keys_proxied: z.number(),
});
// ============ Sharing Types ============
export const ShareRowSchema = z.object({
    id: z.string(),
    vault_key_id: z.string(),
    grantee_address: z.string(),
    granted_by: z.string(),
    expires_at: z.string().optional().nullable(),
    created_at: z.string(),
    is_active: z.boolean(),
});
export const GrantSharePayloadSchema = z.object({
    vault_key_id: z.string(),
    grantee_address: z.string(),
    expires_at: z.string().optional(),
});
// ============ Session Types ============
export const SessionSchema = z.object({
    id: z.string(),
    ip_address: z.string(),
    user_agent: z.string(),
    created_at: z.string(),
    last_active_at: z.string(),
    is_current: z.boolean(),
});
// ============ Auth Types ============
export const LoginTokenSchema = z.object({
    token: z.string(),
    wallet_address: z.string().optional().nullable(),
    expires_at: z.string(),
});
// ============ Health ============
export const HealthCheckSchema = z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    latency_ms: z.number().optional(),
    version: z.string(),
});
// ============ x402 Trust ============
export const TrustEntrySchema = z.object({
    hostname: z.string(),
    threshold_usd: z.number().min(0),
    enabled: z.boolean().default(true),
});
// ============ Audit ============
export const AuditRetentionSchema = z.object({
    max_age_days: z.number().min(1).default(30),
    max_entries: z.number().min(100).default(1000),
});
// ============ Preferences ============
export const UserPreferencesSchema = z.object({
    reveal_duration_sec: z.number().min(5).max(120).default(30),
    default_expiry_days: z.number().min(1).max(365).default(30),
    notify_on_expiry: z.boolean().default(true),
    notify_on_anomaly: z.boolean().default(true),
    theme: z.enum(['light', 'dark', 'system']).default('dark'),
    sidebar_collapsed: z.boolean().default(false),
});
// ============ Infer helper ============
export function inferVaultItemType(slug) {
    const map = {
        api_key: 'api_key',
        password: 'password',
        note: 'note',
        env: 'env',
        ssh_key: 'ssh_key',
    };
    return map[slug] ?? 'note';
}
export function inferVaultTypeIcon(type) {
    const icons = {
        api_key: '🔑',
        password: '🔒',
        note: '📝',
        env: '⚙️',
        ssh_key: '🖥️',
    };
    return icons[type];
}
//# sourceMappingURL=index.js.map