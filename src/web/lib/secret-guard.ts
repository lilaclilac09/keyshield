const savingSecrets = new Map<string, number>();
const consoleWrappers = new Map<string, unknown>();
const originalConsole = new Map<string, (...args: unknown[]) => void>();

function decoded(text: string): string {
  let value = text;
  for (let i = 0; i < 3; i++) {
    try { value = decodeURIComponent(value); } catch { /* not URL encoded */ }
    value = value.replace(/\\u([\da-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\(["\\/bfnrt])/g, (match) => {
        try { return JSON.parse(`"${match}"`); } catch { return match; }
      });
  }
  return value;
}

export function containsSavingSecret(text: string): boolean {
  const plain = decoded(text);
  return [...savingSecrets.keys()].some((secret) => text.includes(secret) || plain.includes(secret) || plain.includes(decoded(secret)));
}

export function redactSavingSecrets<T>(value: T): T {
  if (!savingSecrets.size) return value;
  const seen = new WeakSet<object>();
  const clean = (item: unknown): unknown => {
    if (typeof item === 'string') return containsSavingSecret(item) ? '[REDACTED]' : item;
    if (!item || typeof item !== 'object') return item;
    if (seen.has(item)) return '[Circular]';
    seen.add(item);
    if (item instanceof Error) return { name: clean(item.name), message: clean(item.message), stack: clean(item.stack) };
    if (Array.isArray(item)) return item.map(clean);
    return Object.fromEntries(Object.entries(item).map(([key, entry]) => [String(clean(key)), clean(entry)]));
  };
  return clean(value) as T;
}

export function registerSavingSecret(raw: string): () => void {
  if (!raw) return () => {};
  savingSecrets.set(raw, (savingSecrets.get(raw) ?? 0) + 1);
  for (const method of ['log', 'info', 'warn', 'error', 'debug', 'trace', 'dir', 'dirxml', 'table', 'assert', 'count', 'countReset', 'time', 'timeLog', 'timeEnd', 'group', 'groupCollapsed'] as const) {
    if (console[method] === consoleWrappers.get(method)) continue;
    const original = console[method] as (...args: unknown[]) => void;
    const wrapper = (...args: unknown[]) => original.apply(console, redactSavingSecrets(args));
    originalConsole.set(method, original);
    consoleWrappers.set(method, wrapper);
    console[method] = wrapper;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const count = savingSecrets.get(raw) ?? 1;
    if (count > 1) savingSecrets.set(raw, count - 1);
    else savingSecrets.delete(raw);
    if (!savingSecrets.size) {
      for (const method of originalConsole.keys()) {
        const target = console as unknown as Record<string, unknown>;
        if (target[method] === consoleWrappers.get(method)) target[method] = originalConsole.get(method);
      }
      originalConsole.clear();
      consoleWrappers.clear();
    }
  };
}

export function assertSafeRequest(url: string, options: RequestInit = {}): void {
  if (!savingSecrets.size) return;
  const headers = [...new Headers(options.headers).entries()];
  const body = options.body;
  let text = '';
  if (typeof body === 'string' || body instanceof URLSearchParams) text = String(body);
  else if (body instanceof ArrayBuffer) text = new TextDecoder().decode(body);
  else if (ArrayBuffer.isView(body)) text = new TextDecoder().decode(body as ArrayBufferView<ArrayBuffer>);
  else if (body != null) throw new Error('Refusing opaque request during device vault save');
  if (containsSavingSecret(url) || containsSavingSecret(JSON.stringify(headers)) || containsSavingSecret(text)) {
    throw new Error('Refusing request containing a device vault secret');
  }
}
