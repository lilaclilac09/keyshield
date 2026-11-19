const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const ITERATIONS = 310000;
const encode = (bytes) => Array.from(new Uint8Array(bytes));

export class LocalVault {
  constructor(storage, { idleMs = 60000, now = Date.now } = {}) {
    this.storage = storage;
    this.idleMs = idleMs;
    this.now = now;
    this.lock();
  }

  lock() {
    clearTimeout(this.timer);
    this.aes = null;
    this.hmac = null;
    this.entries = null;
  }

  touch() {
    this.lastUsed = this.now();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.lock(), this.idleMs);
    this.timer.unref?.();
  }

  requireUnlocked() {
    if (!this.aes || this.now() - this.lastUsed >= this.idleMs) {
      this.lock();
      throw new Error('Unlock the vault first');
    }
    this.touch();
  }

  async unlock(passphrase) {
    this.lock();
    if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('Use at least 12 characters');
    const { vault } = await this.storage.get('vault');
    const salt = vault ? new Uint8Array(vault.salt) : crypto.getRandomValues(new Uint8Array(16));
    const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, material, 512));
    const aes = await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const hmac = await crypto.subtle.importKey('raw', bits.slice(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    bits.fill(0);
    let entries = [];
    if (vault) {
      try {
        entries = JSON.parse(decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(vault.iv) }, aes, new Uint8Array(vault.ciphertext))));
      } catch {
        throw new Error('Incorrect passphrase or damaged vault');
      }
    }
    this.aes = aes;
    this.hmac = hmac;
    this.entries = entries;
    this.salt = salt;
    this.touch();
    if (!vault) {
      try { await this.persist(); }
      catch (error) { this.lock(); throw error; }
    }
  }

  async persist() {
    this.requireUnlocked();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, this.aes, encoder.encode(JSON.stringify(this.entries)));
    await this.storage.set({ vault: { version: 1, iterations: ITERATIONS, salt: encode(this.salt), iv: encode(iv), ciphertext: encode(ciphertext) } });
  }

  async save(candidate, label, confirmDuplicate = false) {
    this.requireUnlocked();
    const fingerprint = encode(await crypto.subtle.sign('HMAC', this.hmac, encoder.encode(candidate.value))).join(',');
    this.requireUnlocked();
    const existing = this.entries.find((entry) => entry.fingerprint === fingerprint);
    if (existing && !confirmDuplicate) return { duplicate: true };
    const previous = structuredClone(this.entries);
    if (existing) existing.label = String(label).slice(0, 100);
    else this.entries.push({ ...candidate, label: String(label).slice(0, 100), fingerprint, id: crypto.randomUUID() });
    try { await this.persist(); }
    catch (error) { if (this.aes) this.entries = previous; throw error; }
    return { saved: true };
  }

  list() {
    this.requireUnlocked();
    return this.entries.map(({ id, provider, origin, label, preview }) => ({ id, provider, origin, label, preview }));
  }

  get(id) {
    this.requireUnlocked();
    const entry = this.entries.find((item) => item.id === id);
    if (!entry) throw new Error('Saved key not found');
    return entry;
  }
}

export async function audit(storage, action, { provider, origin }) {
  if (!['saved', 'declined', 'filled'].includes(action)) throw new Error('Invalid audit action');
  const { auditLog = [] } = await storage.get('auditLog');
  await storage.set({ auditLog: [...auditLog.slice(-499), { action, provider, origin, time: new Date().toISOString() }] });
}
