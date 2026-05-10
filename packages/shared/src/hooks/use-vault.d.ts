export declare function useVault(): {
    items: {
        type: "api_key" | "password" | "note" | "env" | "ssh_key";
        id: string;
        name: string;
        created_at: string;
        updated_at: string;
        tags: string[];
        upstream?: string | null | undefined;
        expires_at?: string | null | undefined;
        masked_value?: string | null | undefined;
    }[];
    isLoading: boolean;
    error: Error | null;
    store: import("@tanstack/react-query").UseMutateAsyncFunction<{
        id: string;
    }, Error, {
        value: string;
        type: "api_key" | "password" | "note" | "env" | "ssh_key";
        name: string;
        tags: string[];
        note?: string | undefined;
        upstream?: string | undefined;
        expires_at?: string | undefined;
        ssh_public?: string | undefined;
        ssh_private?: string | undefined;
    }, unknown>;
    isStoring: boolean;
    decrypt: import("@tanstack/react-query").UseMutateAsyncFunction<{
        value: string;
        id: string;
        note?: string | undefined;
        ssh_public?: string | undefined;
        ssh_private?: string | undefined;
    }, Error, string, unknown>;
    isDecrypting: boolean;
    deleteKey: import("@tanstack/react-query").UseMutateAsyncFunction<void, Error, string, unknown>;
    isDeleting: boolean;
    refetch: (options?: import("@tanstack/react-query").RefetchOptions) => Promise<import("@tanstack/react-query").QueryObserverResult<{
        type: "api_key" | "password" | "note" | "env" | "ssh_key";
        id: string;
        name: string;
        created_at: string;
        updated_at: string;
        tags: string[];
        upstream?: string | null | undefined;
        expires_at?: string | null | undefined;
        masked_value?: string | null | undefined;
    }[], Error>>;
};
//# sourceMappingURL=use-vault.d.ts.map