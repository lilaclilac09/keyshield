export declare function useSharing(): {
    incoming: {
        id: string;
        created_at: string;
        is_active: boolean;
        vault_key_id: string;
        grantee_address: string;
        granted_by: string;
        expires_at?: string | null | undefined;
    }[];
    outgoing: {
        id: string;
        created_at: string;
        is_active: boolean;
        vault_key_id: string;
        grantee_address: string;
        granted_by: string;
        expires_at?: string | null | undefined;
    }[];
    isLoading: boolean;
    grant: import("@tanstack/react-query").UseMutateAsyncFunction<{
        id: string;
    }, Error, {
        vault_key_id: string;
        grantee_address: string;
        expires_at?: string | undefined;
    }, unknown>;
    isGranting: boolean;
    revoke: import("@tanstack/react-query").UseMutateAsyncFunction<void, Error, string, unknown>;
    isRevoking: boolean;
};
//# sourceMappingURL=use-sharing.d.ts.map