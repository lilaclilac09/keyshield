export const FIXTURE_ENTRY = Object.freeze({ label: 'Demo key', value: 'FAKE_KEYSHIELD_NOT_A_KEY::demo' });
export const FIXTURE_STORAGE = 'ks-mas-fixture:v1';
const encoder = new TextEncoder();
// Public, bundled seed: demonstrates lock mechanics only, not real protection.
const PUBLIC_SEED = 'KeyShield MAS fixture public lock mechanics seed v1';
interface Envelope { version: 1; locked: boolean; iv: string; ciphertext: string }
type Entry = typeof FIXTURE_ENTRY;
interface Snapshot { locked: boolean; entry: Entry | null; error: string | null }

function validEntry(entry: unknown): entry is Entry {
  if (!entry || typeof entry !== 'object') return false;
  const candidate = entry as Record<string, unknown>;
  return Object.keys(candidate).length === 2 && candidate.label === FIXTURE_ENTRY.label && candidate.value === FIXTURE_ENTRY.value;
}
const aad = (locked: boolean) => encoder.encode(`${FIXTURE_STORAGE}:${locked}`);
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const bytes = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));

async function deriveKey(): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(PUBLIC_SEED), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(FIXTURE_STORAGE), info: encoder.encode('public fixture AES-GCM') }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export function createFixtureSession(storage: Pick<Storage, 'getItem' | 'setItem'>) {
  let key: CryptoKey | null = null;
  let state: Snapshot = { locked: true, entry: null, error: null };
  async function read(candidate: CryptoKey): Promise<{ envelope: Envelope; entry: Entry | null } | null> {
    const raw = storage.getItem(FIXTURE_STORAGE);
    if (raw === null) return null;
    const envelope = JSON.parse(raw) as Envelope;
    if (envelope?.version !== 1 || Object.keys(envelope).length !== 4 || typeof envelope.locked !== 'boolean' || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string') throw new Error('Invalid fixture envelope');
    const iv = bytes(envelope.iv);
    if (iv.byteLength !== 12) throw new Error('Invalid fixture IV');
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(envelope.locked) }, candidate, bytes(envelope.ciphertext));
    const data = JSON.parse(new TextDecoder().decode(plaintext));
    if (!data || Object.keys(data).length !== 1 || !Object.hasOwn(data, 'entry') || (data.entry !== null && !validEntry(data.entry))) throw new Error('Invalid fixture entry');
    return { envelope, entry: data.entry };
  }
  async function write(candidate: CryptoKey, locked: boolean, entry: Entry | null) {
    if (entry !== null && !validEntry(entry)) throw new Error('Only the exact fixture pair is allowed');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(locked) }, candidate, encoder.encode(JSON.stringify({ entry })));
    storage.setItem(FIXTURE_STORAGE, JSON.stringify({ version: 1, locked, iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)) }));
  }
  async function attempt(action: () => Promise<void>) {
    try { await action(); } catch {
      key = null;
      state = { locked: true, entry: null, error: 'Fixture data rejected. Nothing was opened or imported. Stored data was not overwritten.' };
    }
  }
  return {
    snapshot: (): Snapshot => ({ ...state }),
    init: () => attempt(async () => {
      const candidate = await deriveKey();
      const stored = await read(candidate);
      key = stored && !stored.envelope.locked ? candidate : null;
      state = { locked: stored?.envelope.locked ?? true, entry: key ? stored!.entry : null, error: null };
    }),
    unlock: () => attempt(async () => {
      const candidate = await deriveKey();
      const stored = await read(candidate);
      await write(candidate, false, stored?.entry ?? null);
      key = candidate;
      state = { locked: false, entry: stored?.entry ?? null, error: null };
    }),
    lock: () => attempt(async () => {
      if (!key || state.locked) throw new Error('Fixture is locked');
      await read(key);
      await write(key, true, state.entry);
      key = null;
      state = { locked: true, entry: null, error: null };
    }),
    save: (entry: unknown) => attempt(async () => {
      if (!key || state.locked || !validEntry(entry)) throw new Error('Only the exact fixture pair is allowed');
      await read(key);
      await write(key, false, entry);
      state = { locked: false, entry: { ...entry }, error: null };
    }),
  };
}
