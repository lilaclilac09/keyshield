export declare function useSessions(): {
    sessions: {
        id: string;
        created_at: string;
        ip_address: string;
        user_agent: string;
        last_active_at: string;
        is_current: boolean;
    }[];
    isLoading: boolean;
    revoke: import("@tanstack/react-query").UseMutateAsyncFunction<void, Error, string, unknown>;
    isRevoking: boolean;
};
//# sourceMappingURL=use-sessions.d.ts.map