export declare function useBilling(limit?: number): {
    info: {
        balance_sol: number;
        balance_usd: number;
        total_spent_usd: number;
        total_keys_proxied: number;
    } | null;
    isLoading: boolean;
    usage: {
        id: string;
        agent_id: string;
        stream_id: string;
        amount_usd: number;
        tokens_in: number;
        tokens_out: number;
        timestamp: string;
        model?: string | undefined;
    }[];
    isUsageLoading: boolean;
};
//# sourceMappingURL=use-billing.d.ts.map