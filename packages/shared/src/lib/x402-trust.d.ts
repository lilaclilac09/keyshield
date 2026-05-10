import type { TrustEntry } from '../types';
export declare function getTrustList(): TrustEntry[];
export declare function getTrustEntry(hostname: string): TrustEntry | null;
export declare function setTrustEntry(entry: TrustEntry): void;
export declare function removeTrustEntry(hostname: string): void;
export declare function isAutoPayApproved(hostname: string, amountUsd: number): boolean;
//# sourceMappingURL=x402-trust.d.ts.map