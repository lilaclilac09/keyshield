import { z } from 'zod';
export declare const VaultItemTypeSchema: z.ZodEnum<["api_key", "password", "note", "env", "ssh_key"]>;
export type VaultItemType = z.infer<typeof VaultItemTypeSchema>;
export declare const VaultItemSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    type: z.ZodEnum<["api_key", "password", "note", "env", "ssh_key"]>;
    upstream: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
    expires_at: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    masked_value: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "api_key" | "password" | "note" | "env" | "ssh_key";
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
    tags: string[];
    upstream?: string | null | undefined;
    expires_at?: string | null | undefined;
    masked_value?: string | null | undefined;
}, {
    type: "api_key" | "password" | "note" | "env" | "ssh_key";
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
    upstream?: string | null | undefined;
    expires_at?: string | null | undefined;
    masked_value?: string | null | undefined;
    tags?: string[] | undefined;
}>;
export type VaultItem = z.infer<typeof VaultItemSchema>;
export declare const StoreKeyPayloadSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodEnum<["api_key", "password", "note", "env", "ssh_key"]>;
    upstream: z.ZodOptional<z.ZodString>;
    value: z.ZodString;
    expires_at: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    note: z.ZodOptional<z.ZodString>;
    ssh_public: z.ZodOptional<z.ZodString>;
    ssh_private: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    value: string;
    type: "api_key" | "password" | "note" | "env" | "ssh_key";
    name: string;
    tags: string[];
    note?: string | undefined;
    upstream?: string | undefined;
    expires_at?: string | undefined;
    ssh_public?: string | undefined;
    ssh_private?: string | undefined;
}, {
    value: string;
    type: "api_key" | "password" | "note" | "env" | "ssh_key";
    name: string;
    note?: string | undefined;
    upstream?: string | undefined;
    expires_at?: string | undefined;
    tags?: string[] | undefined;
    ssh_public?: string | undefined;
    ssh_private?: string | undefined;
}>;
export type StoreKeyPayload = z.infer<typeof StoreKeyPayloadSchema>;
export declare const DecryptedKeySchema: z.ZodObject<{
    id: z.ZodString;
    value: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
    ssh_public: z.ZodOptional<z.ZodString>;
    ssh_private: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    value: string;
    id: string;
    note?: string | undefined;
    ssh_public?: string | undefined;
    ssh_private?: string | undefined;
}, {
    value: string;
    id: string;
    note?: string | undefined;
    ssh_public?: string | undefined;
    ssh_private?: string | undefined;
}>;
export type DecryptedKey = z.infer<typeof DecryptedKeySchema>;
export declare const AgentSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    agent_id: z.ZodString;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    created_at: z.ZodString;
    last_seen_at: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    is_active: z.ZodBoolean;
    rate_limit_rpm: z.ZodNullable<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    created_at: string;
    agent_id: string;
    is_active: boolean;
    description?: string | null | undefined;
    last_seen_at?: string | null | undefined;
    rate_limit_rpm?: number | null | undefined;
}, {
    id: string;
    name: string;
    created_at: string;
    agent_id: string;
    is_active: boolean;
    description?: string | null | undefined;
    last_seen_at?: string | null | undefined;
    rate_limit_rpm?: number | null | undefined;
}>;
export type Agent = z.infer<typeof AgentSchema>;
export declare const RegisterAgentPayloadSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    rate_limit_rpm: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    description?: string | undefined;
    rate_limit_rpm?: number | undefined;
}, {
    name: string;
    description?: string | undefined;
    rate_limit_rpm?: number | undefined;
}>;
export type RegisterAgentPayload = z.infer<typeof RegisterAgentPayloadSchema>;
export declare const MppStreamSchema: z.ZodObject<{
    id: z.ZodString;
    agent_id: z.ZodString;
    name: z.ZodString;
    stream_address: z.ZodString;
    total_deposited_sol: z.ZodNumber;
    total_withdrawn_sol: z.ZodNumber;
    total_usage_usd: z.ZodNumber;
    status: z.ZodEnum<["active", "paused", "closed"]>;
    created_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "active" | "paused" | "closed";
    id: string;
    name: string;
    created_at: string;
    agent_id: string;
    stream_address: string;
    total_deposited_sol: number;
    total_withdrawn_sol: number;
    total_usage_usd: number;
}, {
    status: "active" | "paused" | "closed";
    id: string;
    name: string;
    created_at: string;
    agent_id: string;
    stream_address: string;
    total_deposited_sol: number;
    total_withdrawn_sol: number;
    total_usage_usd: number;
}>;
export type MppStream = z.infer<typeof MppStreamSchema>;
export declare const MppUsageEntrySchema: z.ZodObject<{
    id: z.ZodString;
    stream_id: z.ZodString;
    agent_id: z.ZodString;
    amount_usd: z.ZodNumber;
    tokens_in: z.ZodNumber;
    tokens_out: z.ZodNumber;
    model: z.ZodOptional<z.ZodString>;
    timestamp: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    agent_id: string;
    stream_id: string;
    amount_usd: number;
    tokens_in: number;
    tokens_out: number;
    timestamp: string;
    model?: string | undefined;
}, {
    id: string;
    agent_id: string;
    stream_id: string;
    amount_usd: number;
    tokens_in: number;
    tokens_out: number;
    timestamp: string;
    model?: string | undefined;
}>;
export type MppUsageEntry = z.infer<typeof MppUsageEntrySchema>;
export declare const BillingInfoSchema: z.ZodObject<{
    balance_sol: z.ZodNumber;
    balance_usd: z.ZodNumber;
    total_spent_usd: z.ZodNumber;
    total_keys_proxied: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    balance_sol: number;
    balance_usd: number;
    total_spent_usd: number;
    total_keys_proxied: number;
}, {
    balance_sol: number;
    balance_usd: number;
    total_spent_usd: number;
    total_keys_proxied: number;
}>;
export type BillingInfo = z.infer<typeof BillingInfoSchema>;
export declare const ShareRowSchema: z.ZodObject<{
    id: z.ZodString;
    vault_key_id: z.ZodString;
    grantee_address: z.ZodString;
    granted_by: z.ZodString;
    expires_at: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    created_at: z.ZodString;
    is_active: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    id: string;
    created_at: string;
    is_active: boolean;
    vault_key_id: string;
    grantee_address: string;
    granted_by: string;
    expires_at?: string | null | undefined;
}, {
    id: string;
    created_at: string;
    is_active: boolean;
    vault_key_id: string;
    grantee_address: string;
    granted_by: string;
    expires_at?: string | null | undefined;
}>;
export type ShareRow = z.infer<typeof ShareRowSchema>;
export declare const GrantSharePayloadSchema: z.ZodObject<{
    vault_key_id: z.ZodString;
    grantee_address: z.ZodString;
    expires_at: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    vault_key_id: string;
    grantee_address: string;
    expires_at?: string | undefined;
}, {
    vault_key_id: string;
    grantee_address: string;
    expires_at?: string | undefined;
}>;
export type GrantSharePayload = z.infer<typeof GrantSharePayloadSchema>;
export declare const SessionSchema: z.ZodObject<{
    id: z.ZodString;
    ip_address: z.ZodString;
    user_agent: z.ZodString;
    created_at: z.ZodString;
    last_active_at: z.ZodString;
    is_current: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    id: string;
    created_at: string;
    ip_address: string;
    user_agent: string;
    last_active_at: string;
    is_current: boolean;
}, {
    id: string;
    created_at: string;
    ip_address: string;
    user_agent: string;
    last_active_at: string;
    is_current: boolean;
}>;
export type Session = z.infer<typeof SessionSchema>;
export declare const LoginTokenSchema: z.ZodObject<{
    token: z.ZodString;
    wallet_address: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    expires_at: z.ZodString;
}, "strip", z.ZodTypeAny, {
    expires_at: string;
    token: string;
    wallet_address?: string | null | undefined;
}, {
    expires_at: string;
    token: string;
    wallet_address?: string | null | undefined;
}>;
export type LoginToken = z.infer<typeof LoginTokenSchema>;
export declare const HealthCheckSchema: z.ZodObject<{
    status: z.ZodEnum<["healthy", "degraded", "unhealthy"]>;
    latency_ms: z.ZodOptional<z.ZodNumber>;
    version: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "healthy" | "degraded" | "unhealthy";
    version: string;
    latency_ms?: number | undefined;
}, {
    status: "healthy" | "degraded" | "unhealthy";
    version: string;
    latency_ms?: number | undefined;
}>;
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
export declare const TrustEntrySchema: z.ZodObject<{
    hostname: z.ZodString;
    threshold_usd: z.ZodNumber;
    enabled: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    hostname: string;
    threshold_usd: number;
    enabled: boolean;
}, {
    hostname: string;
    threshold_usd: number;
    enabled?: boolean | undefined;
}>;
export type TrustEntry = z.infer<typeof TrustEntrySchema>;
export declare const AuditRetentionSchema: z.ZodObject<{
    max_age_days: z.ZodDefault<z.ZodNumber>;
    max_entries: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    max_age_days: number;
    max_entries: number;
}, {
    max_age_days?: number | undefined;
    max_entries?: number | undefined;
}>;
export type AuditRetention = z.infer<typeof AuditRetentionSchema>;
export declare const UserPreferencesSchema: z.ZodObject<{
    reveal_duration_sec: z.ZodDefault<z.ZodNumber>;
    default_expiry_days: z.ZodDefault<z.ZodNumber>;
    notify_on_expiry: z.ZodDefault<z.ZodBoolean>;
    notify_on_anomaly: z.ZodDefault<z.ZodBoolean>;
    theme: z.ZodDefault<z.ZodEnum<["light", "dark", "system"]>>;
    sidebar_collapsed: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    reveal_duration_sec: number;
    default_expiry_days: number;
    notify_on_expiry: boolean;
    notify_on_anomaly: boolean;
    theme: "light" | "dark" | "system";
    sidebar_collapsed: boolean;
}, {
    reveal_duration_sec?: number | undefined;
    default_expiry_days?: number | undefined;
    notify_on_expiry?: boolean | undefined;
    notify_on_anomaly?: boolean | undefined;
    theme?: "light" | "dark" | "system" | undefined;
    sidebar_collapsed?: boolean | undefined;
}>;
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;
export declare function inferVaultItemType(slug: string): VaultItemType;
export declare function inferVaultTypeIcon(type: VaultItemType): string;
//# sourceMappingURL=index.d.ts.map