import type { LoginToken } from '../types';
export interface WalletProvider {
    publicKey?: {
        toString(): string;
        toBytes(): Uint8Array;
    };
    isConnected?: boolean;
    connect?(opts?: Record<string, unknown>): Promise<void>;
    disconnect?(): Promise<void>;
    signMessage?(message: Uint8Array, encoding?: string): Promise<{
        signature: Uint8Array;
    } | Uint8Array>;
    sign?(message: Uint8Array): Promise<{
        signature: Uint8Array;
    }>;
    isPhantom?: boolean;
    isSolflare?: boolean;
    isBackpack?: boolean;
    on?(event: string, handler: (...args: unknown[]) => void): void;
    off?(event: string, handler: (...args: unknown[]) => void): void;
}
export interface WalletInfo {
    name: string;
    key: string;
    icon: string;
    url: string;
    provider: WalletProvider;
    isInstalled: boolean;
    isConnected: boolean;
    address: string | null;
}
export declare function detectWallets(): WalletInfo[];
export declare function getAvailableWallets(): WalletInfo[];
export declare function getConnectedWallet(): WalletInfo | null;
export declare function connectWalletByKey(key: string): Promise<WalletInfo>;
export declare function disconnectWallet(): Promise<void>;
export declare const VAULT_KEY_MESSAGE = "KeyShield Vault Authentication";
export declare function signWithWallet(message: string, provider: WalletProvider): Promise<Uint8Array>;
export declare function deriveVaultPassphrase(signatureBytes: Uint8Array): Promise<string>;
export declare function generateSessionToken(walletAddress: string, signatureBytes: Uint8Array): Promise<LoginToken>;
export declare function saveToken(token: LoginToken, isDemo?: boolean): void;
export declare function getToken(): string | null;
export declare function getWalletAddress(): string | null;
export declare function isDemoMode(): boolean;
export declare function clearAuth(): void;
export declare function isAuthenticated(): boolean;
//# sourceMappingURL=index.d.ts.map