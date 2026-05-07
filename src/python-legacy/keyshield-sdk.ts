/**
 * keyshield-sdk.ts — KeyShield v2 TypeScript/JavaScript SDK
 *
 * Works in both Node.js (v18+) and modern browsers.
 * Zero dependencies — uses the native fetch API.
 *
 * Install (for Node.js):
 *   npm i keyshield-sdk   (if published)
 *   # or copy this file and import directly
 *
 * Quick start:
 *   import { KeyShield } from './keyshield-sdk';
 *
 *   const ks = new KeyShield('http://localhost:8000');
 *   await ks.login('mywallet', 'mypassphrase');
 *
 *   await ks.store('openai', 'sk-proj-xxxx');
 *   const keys = await ks.listKeys();          // ['openai']
 *
 *   const res = await ks.proxy('openai', 'v1/chat/completions', {
 *     method: 'POST',
 *     json: { model: 'gpt-4o-mini', messages: [{ role: 'user', content: 'hi' }] },
 *   });
 *   console.log(await res.json());
 */

export class KeyShieldError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`[${status}] ${detail}`);
    this.name = 'KeyShieldError';
  }
}

export interface ProxyOptions {
  method?: string;
  json?: unknown;
  headers?: Record<string, string>;
}

export interface BatchRequest {
  upstream: string;
  path?: string;
  method?: string;
  body?: unknown;
}

export interface BatchResult {
  status?: number;
  cache?: string;
  data?: unknown;
  error?: string;
}

export interface WalletChallengeResponse {
  challenge: string;
  nonce: string;
}

export interface WalletLoginResult {
  token: string;
  userId: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  generic_cache: number;
  router: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────

export class KeyShield {
  private token: string | null = null;

  constructor(
    private readonly baseUrl: string = 'http://localhost:8000',
    private readonly defaultHeaders: Record<string, string> = {},
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  /**
   * Password-based login.
   * Returns the session token and stores it for subsequent calls.
   */
  async login(userId: string, password: string): Promise<string> {
    const data = await this._post<{ token: string }>('/auth/login', { userId, password });
    this.token = data.token;
    return this.token;
  }

  /**
   * Fetch a one-time challenge for wallet signing.
   */
  async walletChallenge(): Promise<WalletChallengeResponse> {
    const res = await fetch(`${this.baseUrl}/auth/wallet-challenge`);
    await this._raise(res);
    return res.json();
  }

  /**
   * Wallet-based login.
   *
   * challenge:       string returned by walletChallenge()
   * signatureBytes:  Uint8Array — ed25519 signature of the challenge (64 bytes)
   * walletAddress:   base58 Solana public key
   * passphrase:      vault encryption passphrase
   *
   * Tip: call this after wallet.signMessage(new TextEncoder().encode(challenge))
   * in the Solana wallet adapter.
   */
  async walletLogin(
    walletAddress: string,
    signatureBytes: Uint8Array,
    challenge: string,
    passphrase: string,
  ): Promise<WalletLoginResult> {
    const signature = btoa(String.fromCharCode(...signatureBytes));
    const data = await this._post<WalletLoginResult>('/auth/wallet-login', {
      walletAddress,
      signature,
      challenge,
      passphrase,
    });
    this.token = data.token;
    return data;
  }

  /**
   * Invalidate the current session token on the server.
   */
  async logout(): Promise<void> {
    if (!this.token) return;
    try {
      await this._authed('POST', '/auth/logout');
    } finally {
      this.token = null;
    }
  }

  /**
   * Manually set a pre-existing token (e.g. loaded from localStorage).
   */
  setToken(token: string): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  // ── Key management ────────────────────────────────────────────────────────

  /**
   * Encrypt and store an API key in the vault.
   * upstream: 'openai' | 'anthropic' | 'mistral' | 'cohere' | 'groq' | 'helius'
   */
  async store(upstream: string, apiKey: string): Promise<void> {
    await this._authedPost('/manage/store', { upstream, apiKey });
  }

  /**
   * List which upstreams you have stored keys for.
   * Returns e.g. ['openai', 'anthropic']
   */
  async listKeys(): Promise<string[]> {
    const data = await this._authed<{ keys: string[] }>('GET', '/manage/list');
    return data.keys;
  }

  /**
   * Delete a stored API key from the vault.
   */
  async deleteKey(upstream: string): Promise<void> {
    await this._authed('DELETE', `/manage/secret/${upstream}`);
  }

  // ── Proxy ─────────────────────────────────────────────────────────────────

  /**
   * Forward a request through the KeyShield proxy.
   * The vault key for `upstream` is injected server-side — your agent code
   * never needs to handle the raw API key.
   *
   * Returns the raw Response so callers can inspect status, headers, and body.
   */
  async proxy(
    upstream: string,
    path: string,
    options: ProxyOptions = {},
  ): Promise<Response> {
    this._requireToken();
    const { method = 'POST', json, headers = {} } = options;
    const res = await fetch(
      `${this.baseUrl}/proxy/${upstream}/${path.replace(/^\//, '')}`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...this.defaultHeaders,
          ...headers,
        },
        body: json !== undefined ? JSON.stringify(json) : undefined,
      },
    );
    return res;
  }

  /**
   * Send up to 20 requests concurrently through the proxy.
   */
  async batch(requests: BatchRequest[]): Promise<BatchResult[]> {
    const data = await this._authedPost<{ results: BatchResult[] }>(
      '/manage/batch',
      { requests },
    );
    return data.results;
  }

  // ── Helius skills ─────────────────────────────────────────────────────────

  async heliusTools(): Promise<unknown[]> {
    const data = await this._get<{ tools: unknown[] }>('/skill/helius/tools');
    return data.tools;
  }

  async heliusRun(tool: string, inputs: Record<string, unknown> = {}): Promise<unknown> {
    const data = await this._authedPost<{ result: unknown }>(
      '/skill/helius/run',
      { tool, inputs },
    );
    return data.result;
  }

  // ── Health ────────────────────────────────────────────────────────────────

  async health(): Promise<HealthResponse> {
    return this._get<HealthResponse>('/health');
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private _requireToken(): string {
    if (!this.token) {
      throw new KeyShieldError(401, 'Not authenticated. Call login() first.');
    }
    return this.token;
  }

  private async _raise(res: Response): Promise<void> {
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const body = await res.json();
        detail = body.detail ?? JSON.stringify(body);
      } catch {
        // ignore JSON parse errors
      }
      throw new KeyShieldError(res.status, detail);
    }
  }

  private async _get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: this.defaultHeaders,
    });
    await this._raise(res);
    return res.json() as Promise<T>;
  }

  private async _post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...this.defaultHeaders },
      body: JSON.stringify(body),
    });
    await this._raise(res);
    return res.json() as Promise<T>;
  }

  private async _authed<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = this._requireToken();
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...this.defaultHeaders,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    await this._raise(res);
    return res.json() as Promise<T>;
  }

  private async _authedPost<T>(path: string, body: unknown): Promise<T> {
    return this._authed<T>('POST', path, body);
  }
}

// ── Agent helper: fire-and-forget proxy ──────────────────────────────────────

/**
 * Minimal helper for AI agents that just need to make a single proxied call.
 * Loads the token from the environment (KS_TOKEN) or an explicit value.
 *
 * Example (in an agent tool handler):
 *   const result = await ksProxy('openai', 'v1/chat/completions', {
 *     json: { model: 'gpt-4o', messages: [...] },
 *   });
 */
export async function ksProxy(
  upstream: string,
  path: string,
  options: ProxyOptions & { baseUrl?: string; token?: string } = {},
): Promise<Response> {
  const {
    baseUrl = process.env['KS_BASE'] ?? 'http://localhost:8000',
    token   = process.env['KS_TOKEN'] ?? '',
    ...proxyOpts
  } = options;

  if (!token) {
    throw new KeyShieldError(401, 'No token. Set KS_TOKEN env var or pass token option.');
  }

  const ks = new KeyShield(baseUrl);
  ks.setToken(token);
  return ks.proxy(upstream, path, proxyOpts);
}

// ── OpenAI-compatible drop-in ─────────────────────────────────────────────────

/**
 * Drop-in OpenAI API wrapper that routes through KeyShield.
 * Uses your vault-stored openai key — no OPENAI_API_KEY needed in your agent.
 *
 * const openai = new KeyShieldOpenAI(ks);
 * const res = await openai.chatCompletions({ model: 'gpt-4o', messages: [...] });
 */
export class KeyShieldOpenAI {
  constructor(private readonly ks: KeyShield) {}

  async chatCompletions(body: Record<string, unknown>): Promise<unknown> {
    const res = await this.ks.proxy('openai', 'v1/chat/completions', { json: body });
    if (!res.ok) throw new KeyShieldError(res.status, await res.text());
    return res.json();
  }

  async models(): Promise<unknown> {
    const res = await this.ks.proxy('openai', 'v1/models', { method: 'GET' });
    if (!res.ok) throw new KeyShieldError(res.status, await res.text());
    return res.json();
  }
}

/**
 * Drop-in Anthropic API wrapper that routes through KeyShield.
 *
 * const claude = new KeyShieldAnthropic(ks);
 * const res = await claude.messages({ model: 'claude-opus-4-5', max_tokens: 256,
 *   messages: [{ role: 'user', content: 'hi' }] });
 */
export class KeyShieldAnthropic {
  constructor(private readonly ks: KeyShield) {}

  async messages(body: Record<string, unknown>): Promise<unknown> {
    const res = await this.ks.proxy('anthropic', 'v1/messages', {
      json: body,
      headers: { 'anthropic-version': '2023-06-01' },
    });
    if (!res.ok) throw new KeyShieldError(res.status, await res.text());
    return res.json();
  }
}
