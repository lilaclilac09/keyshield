/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImageCapture {
  grabFrame(): Promise<ImageBitmap>;
  close(): Promise<void>;
}
