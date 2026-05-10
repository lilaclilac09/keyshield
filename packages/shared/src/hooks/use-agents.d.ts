export declare function useAgents(): {
    agents: {
        id: string;
        name: string;
        created_at: string;
        agent_id: string;
        is_active: boolean;
        description?: string | null | undefined;
        last_seen_at?: string | null | undefined;
        rate_limit_rpm?: number | null | undefined;
    }[];
    isLoading: boolean;
    register: import("@tanstack/react-query").UseMutateAsyncFunction<{
        id: string;
    }, Error, {
        name: string;
        description?: string | undefined;
        rate_limit_rpm?: number | undefined;
    }, unknown>;
    isRegistering: boolean;
    revoke: import("@tanstack/react-query").UseMutateAsyncFunction<void, Error, string, unknown>;
    isRevoking: boolean;
    wallets: {
        id: string;
        address: string;
        balance_sol: number;
    }[];
    refetch: (options?: import("@tanstack/react-query").RefetchOptions) => Promise<import("@tanstack/react-query").QueryObserverResult<{
        id: string;
        name: string;
        created_at: string;
        agent_id: string;
        is_active: boolean;
        description?: string | null | undefined;
        last_seen_at?: string | null | undefined;
        rate_limit_rpm?: number | null | undefined;
    }[], Error>>;
};
//# sourceMappingURL=use-agents.d.ts.map