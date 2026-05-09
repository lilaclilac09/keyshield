/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly KEYSHIELD_API_URL: string;
  readonly KEYSHIELD_PROGRAM_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
