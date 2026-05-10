export declare function useHealth(): import("@tanstack/react-query").UseQueryResult<{
    status: "healthy" | "degraded" | "unhealthy";
    version: string;
    latency_ms?: number | undefined;
}, Error>;
//# sourceMappingURL=use-health.d.ts.map