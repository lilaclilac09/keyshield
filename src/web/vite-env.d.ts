/// <reference types="vite/client" />

export {};

declare global {
  interface KeyshieldDesktopShell {
    isDesktop: boolean;
    platform: string;
    apiBase: string;
    live: boolean;
    promptTouchID: (reason?: string) => Promise<{ ok: boolean; skipped?: boolean; error?: string }>;
  }
  interface Window {
    keyshieldDesktop?: KeyshieldDesktopShell;
  }
}

