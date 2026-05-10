interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SOLANA_CLUSTER?: string;
  readonly VITE_KEYSHIELD_RPC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
