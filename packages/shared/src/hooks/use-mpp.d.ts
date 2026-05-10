export declare function useMpp(streamId?: string): {
    streams: {
        status: "active" | "paused" | "closed";
        id: string;
        name: string;
        created_at: string;
        agent_id: string;
        stream_address: string;
        total_deposited_sol: number;
        total_withdrawn_sol: number;
        total_usage_usd: number;
    }[];
    isLoading: boolean;
    open: import("@tanstack/react-query").UseMutateAsyncFunction<{
        stream_id: string;
        tx: string;
    }, Error, {
        agentId: string;
        amountSol: number;
    }, unknown>;
    isOpening: boolean;
    settle: import("@tanstack/react-query").UseMutateAsyncFunction<void, Error, string, unknown>;
    close: import("@tanstack/react-query").UseMutateAsyncFunction<void, Error, string, unknown>;
    recordTx: import("@tanstack/react-query").UseMutateAsyncFunction<void, Error, {
        streamId: string;
        txSig: string;
    }, unknown>;
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
    refetch: (options?: import("@tanstack/react-query").RefetchOptions) => Promise<import("@tanstack/react-query").QueryObserverResult<{
        status: "active" | "paused" | "closed";
        id: string;
        name: string;
        created_at: string;
        agent_id: string;
        stream_address: string;
        total_deposited_sol: number;
        total_withdrawn_sol: number;
        total_usage_usd: number;
    }[], Error>>;
};
//# sourceMappingURL=use-mpp.d.ts.map