/**
 * Stub `chrome.*` namespace for Vite dev mode.
 *
 * When the popup runs as a real Chrome extension, `globalThis.chrome` is
 * provided by the browser. When it runs under `npm run dev` it isn't —
 * Vite would crash on the first storage call. This shim installs an
 * in-memory replacement only if no real implementation is present.
 *
 * Loaded by index.tsx before importing anything that touches chrome.*.
 */

type Listener = (changes: any, areaName: string) => void;

interface MemArea {
  store: Map<string, unknown>;
  get(
    keys: string | string[] | null,
    cb: (items: Record<string, unknown>) => void,
  ): void;
  set(items: Record<string, unknown>, cb?: () => void): void;
  remove(keys: string | string[], cb?: () => void): void;
}

function makeArea(): MemArea {
  const store = new Map<string, unknown>();
  return {
    store,
    get(keys, cb) {
      const out: Record<string, unknown> = {};
      const want = keys == null
        ? Array.from(store.keys())
        : Array.isArray(keys)
          ? keys
          : [keys];
      for (const k of want) {
        if (store.has(k)) out[k] = store.get(k);
      }
      cb(out);
    },
    set(items, cb) {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
      cb?.();
    },
    remove(keys, cb) {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) store.delete(k);
      cb?.();
    },
  };
}

export function installChromeShim(): void {
  const g = globalThis as any;
  if (g.chrome?.storage?.local && g.chrome?.storage?.session) return;
  const local = makeArea();
  const session = makeArea();
  const onChanged = {
    addListener(_l: Listener) {},
    removeListener(_l: Listener) {},
  };
  g.chrome = g.chrome ?? {};
  g.chrome.storage = g.chrome.storage ?? {};
  g.chrome.storage.local = local as any;
  g.chrome.storage.session = session as any;
  g.chrome.storage.onChanged = onChanged;
  // eslint-disable-next-line no-console
  console.info(
    '[KeyShield] chrome.* shim installed (Vite dev — not a real extension context).',
  );
}
