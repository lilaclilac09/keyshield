/// <reference types="vite/client" />

export {};

declare global {
  interface KeyshieldDesktopShell {
    isDesktop: boolean;
    platform: string;
    apiBase: string;
    live: boolean;
    promptTouchID: (reason?: string) => Promise<{ ok: boolean; skipped?: boolean; error?: string }>;
    notify?: (payload: { kind?: string; title: string; detail?: string; source?: string }) => void;
    focusMainWindow?: () => void;
    openExternal?: (url: string) => void;
  }
  interface Window {
    keyshieldDesktop?: KeyshieldDesktopShell;
  }
}

