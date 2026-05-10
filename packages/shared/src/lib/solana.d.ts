export declare const APS_SEED = "keyshield_mpp";
export declare function getProgramId(): string;
export declare function derivePda(seeds: Uint8Array[], programId: string): {
    key: string;
    bump: number;
};
export declare function buildExplorerUrl(txSig: string, cluster?: string): string;
export declare function buildOpenTxParams(streamAddress: string, amountLamports: bigint): Record<string, unknown>;
export declare function solToLamports(sol: number): bigint;
export declare function lamportsToSol(lamports: bigint | number): number;
export declare function shortAddress(addr: string, chars?: number): string;
//# sourceMappingURL=solana.d.ts.map