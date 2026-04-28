import '@testing-library/jest-dom/vitest';

// jsdom doesn't ship a Web Crypto polyfill but we depend on it in vault.ts.
// Use Node's webcrypto.
import { webcrypto } from 'node:crypto';
if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto;
}

// jsdom doesn't have alert / confirm — App.tsx calls them on error paths.
// Stub to no-ops so tests don't throw.
if (typeof globalThis.alert !== 'function') {
  globalThis.alert = () => {};
}
if (typeof globalThis.confirm !== 'function') {
  globalThis.confirm = () => true;
}

// Provide an in-memory chrome.storage shim mirroring chrome-shim.ts so the
// wiring.ts services work under jsdom.
function makeArea() {
  const store = new Map<string, unknown>();
  return {
    get(keys: any, cb: any) {
      const out: Record<string, unknown> = {};
      const want = keys == null
        ? Array.from(store.keys())
        : Array.isArray(keys) ? keys : [keys];
      for (const k of want) if (store.has(k)) out[k] = store.get(k);
      cb(out);
    },
    set(items: any, cb?: any) {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
      cb?.();
    },
    remove(keys: any, cb?: any) {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) store.delete(k);
      cb?.();
    },
  };
}
const g = globalThis as any;
g.chrome = g.chrome ?? {};
g.chrome.storage = g.chrome.storage ?? {
  local: makeArea(),
  session: makeArea(),
  onChanged: { addListener() {}, removeListener() {} },
};
