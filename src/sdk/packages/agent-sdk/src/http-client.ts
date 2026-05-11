/**
 * KeyShield HTTP Client — lightweight agent client that actually works.
 *
 * Flow:
 *   1. agent-challenge  → get nonce
 *   2. sign nonce with keypair (Ed25519)
 *   3. agent-login      → get bearer token
 *   4. /manage/decrypt  → get plaintext API key
 *   5. /proxy/{upstream}/{path} with X-Upstream-API-Key header → upstream call
 *
 * Works in Node.js and browsers. No Solana RPC required.
 *
 * Usage:
 *   const ks = new KeyShieldHttp({ apiUrl: 'http://127.0.0.1:8001', keypair });
 *   await ks.login('agent_pubkey_b58');
 *   const reply = await ks.callClaude('anthropic-key-id', [{ role:'user', content:'Hello' }]);
 */

// nacl for Ed25519 signing — pure JS, no native deps
import nacl from 'tweetnacl';

export interface KeyShieldHttpConfig {
  /** KeyShield backend URL. Default: http://127.0.0.1:8001 */
  apiUrl?: string;
  /** Ed25519 keypair used to sign the login challenge. */
  keypair: { publicKey: Uint8Array; secretKey: Uint8Array };
}

export interface ProxyCallOptions extends RequestInit {
  /** Override the vault key ID to decrypt (by default uses upstream name). */
  vaultKeyId?: string;
  /** Skip vault lookup and use this key directly. */
  rawApiKey?: string;
}

export class KeyShieldHttp {
  private readonly base: string;
  private readonly keypair: { publicKey: Uint8Array; secretKey: Uint8Array };
  private token: string | null = null;
  private pubkeyB58: string | null = null;

  constructor(config: KeyShieldHttpConfig) {
    this.base = (config.apiUrl ?? 'http://127.0.0.1:8001').replace(/\/$/, '');
    this.keypair = config.keypair;
  }

  // ─── Auth ──────────────────────────────────────────────────────────

  /**
   * Authenticate as an agent. Must be called before vault/proxy operations.
   * Token is cached; call again to refresh.
   */
  async login(pubkeyB58: string): Promise<string> {
    this.pubkeyB58 = pubkeyB58;

    const chalRes = await fetch(`${this.base}/auth/agent-challenge`, { method: 'POST' });
    if (!chalRes.ok) throw new Error(`challenge failed: ${chalRes.status}`);
    const { challenge, nonce } = await chalRes.json() as { challenge: string; nonce: string };

    // Sign the raw challenge bytes with the agent's Ed25519 keypair
    const sigBytes = nacl.sign.detached(
      new TextEncoder().encode(challenge),
      this.keypair.secretKey,
    );
    const signature = btoa(String.fromCharCode(...sigBytes));

    const loginRes = await fetch(`${this.base}/auth/agent-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pubkeyB58, challenge, nonce, signature }),
    });
    if (!loginRes.ok) {
      const err = await loginRes.json().catch(() => ({ error: 'login failed' }));
      throw new Error((err as any).error ?? 'agent-login failed');
    }
    const { token } = await loginRes.json() as { token: string };
    this.token = token;
    return token;
  }

  /** True once login() has been called successfully. */
  get isAuthenticated(): boolean {
    return this.token !== null;
  }

  // ─── Vault ─────────────────────────────────────────────────────────

  /** Fetch the plaintext value of a vault item by its ID. */
  async decryptKey(vaultItemId: string): Promise<string> {
    this._requireAuth();
    const res = await fetch(`${this.base}/manage/decrypt/${encodeURIComponent(vaultItemId)}`, {
      headers: this._authHeaders(),
    });
    if (!res.ok) throw new Error(`decrypt failed: ${res.status}`);
    const { value } = await res.json() as { value: string };
    return value;
  }

  /** List all vault items (masked values). */
  async listVault() {
    this._requireAuth();
    const res = await fetch(`${this.base}/manage/vault`, { headers: this._authHeaders() });
    if (!res.ok) throw new Error(`list vault failed: ${res.status}`);
    return res.json();
  }

  // ─── Proxy calls ───────────────────────────────────────────────────

  /**
   * Call an Anthropic API endpoint through the KeyShield proxy.
   * Automatically fetches the decrypted key from the vault.
   *
   * @param vaultKeyId  Vault item ID containing the Anthropic API key.
   * @param messages    Chat messages array.
   * @param model       Model ID. Default: claude-sonnet-4-6 (latest).
   */
  async callClaude(
    vaultKeyId: string,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    model = 'claude-sonnet-4-6',
  ) {
    const apiKey = await this.decryptKey(vaultKeyId);
    return this.proxy('anthropic', 'v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages,
      }),
      rawApiKey: apiKey,
    });
  }

  /**
   * Call an OpenAI API endpoint through the KeyShield proxy.
   *
   * @param vaultKeyId  Vault item ID containing the OpenAI API key.
   * @param messages    Chat messages array.
   * @param model       Model ID. Default: gpt-4o.
   */
  async callOpenAI(
    vaultKeyId: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    model = 'gpt-4o',
  ) {
    const apiKey = await this.decryptKey(vaultKeyId);
    return this.proxy('openai', 'v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model, messages }),
      rawApiKey: apiKey,
    });
  }

  /**
   * Generic proxy call to any upstream provider.
   *
   * @param upstream   Provider name: 'anthropic' | 'openai' | 'helius' | …
   * @param path       API path after the provider base, e.g. 'v1/messages'.
   * @param options    Fetch options + `rawApiKey` or `vaultKeyId`.
   */
  async proxy(upstream: string, path: string, options: ProxyCallOptions = {}) {
    this._requireAuth();
    const { rawApiKey, vaultKeyId, ...fetchOpts } = options;

    const apiKey = rawApiKey ?? (vaultKeyId ? await this.decryptKey(vaultKeyId) : null);
    if (!apiKey) throw new Error('proxy: provide rawApiKey or vaultKeyId');

    const headers = new Headers(fetchOpts.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('Authorization', `Bearer ${this.token}`);
    headers.set('X-Upstream-API-Key', apiKey);

    const res = await fetch(`${this.base}/proxy/${upstream}/${path}`, {
      ...fetchOpts,
      headers,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`proxy ${upstream}/${path} → ${res.status}: ${JSON.stringify(body)}`);
    }
    return res.json();
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private _requireAuth() {
    if (!this.token) throw new Error('Not authenticated. Call login() first.');
  }

  private _authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.token!}` };
  }

  /**
   * Convenience factory: generate a fresh Ed25519 keypair suitable for
   * this client. In production the keypair should be persisted securely.
   */
  static generateKeypair() {
    const kp = nacl.sign.keyPair();
    return { publicKey: kp.publicKey, secretKey: kp.secretKey };
  }

  /**
   * Encode a raw public key as base58 (for agent registration).
   * Requires the bs58 package; falls back to base64url.
   */
  static pubkeyToB58(pubkey: Uint8Array): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bs58 = require('bs58') as { encode: (b: Uint8Array) => string };
      return bs58.encode(pubkey);
    } catch {
      return btoa(String.fromCharCode(...pubkey))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    }
  }
}
