/**
 * HTTP client for the v2-mvp FastAPI server (the proxy / vault that
 * lives in /v2-mvp/src/server.py on this repo's main branch). The
 * Next.js frontend at /frontend/ talks to the same endpoints; this
 * client gives the CLI parity with that frontend.
 *
 * Threat model note: the v2-mvp server stores the user's password
 * encrypted-at-rest and uses it server-side to AES-decrypt vault
 * .enc files when a token-bearing request asks for one. So the
 * server has plaintext access during proxy / decrypt operations.
 * That's the explicit v2-mvp design — different from the V1.1
 * extension-sync model where the server only ever sees ciphertext.
 *
 * The CLI exposes both modes:
 *   - default: read a popup-exported .env (V1.1 path)
 *   - logged in: hit the v2-mvp HTTP API (this module)
 *
 * Endpoints contracted here, lifted directly from server.py:
 *   POST   /auth/login           {userId, password} → {token}
 *   POST   /auth/logout          Bearer            → {ok}
 *   GET    /manage/list          Bearer            → {keys, items}
 *   GET    /manage/decrypt/{u}   Bearer            → {upstream, key}
 *   POST   /manage/store         Bearer + {upstream, apiKey}
 *   DELETE /manage/secret/{u}    Bearer
 */

export interface V2ClientConfig {
  baseUrl: string;
  /** Optional fetch override (for tests). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Per-request timeout. Default 8s. */
  timeoutMs?: number;
}

export interface ListedKey {
  upstream: string;
  createdAt: number;
  updatedAt: number;
}

export class V2Client {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(cfg: V2ClientConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.fetchImpl = cfg.fetchImpl ?? fetch.bind(globalThis);
    this.timeoutMs = cfg.timeoutMs ?? 8000;
  }

  async login(userId: string, password: string): Promise<string> {
    const res = await this.request('POST', '/auth/login', undefined, {
      userId,
      password,
    });
    if (!res.ok) {
      throw new Error(`login failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { token?: string };
    if (!body.token) throw new Error('login response missing `token` field');
    return body.token;
  }

  async logout(token: string): Promise<void> {
    const res = await this.request('POST', '/auth/logout', token);
    // 401 / 403 here just means the token was already invalid — fine.
    if (res.status >= 500) {
      throw new Error(`logout failed: HTTP ${res.status}`);
    }
  }

  async listKeys(token: string): Promise<ListedKey[]> {
    const res = await this.request('GET', '/manage/list', token);
    if (!res.ok) {
      throw new Error(`listKeys failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { items?: ListedKey[] };
    return body.items ?? [];
  }

  /** Fetch decrypted plaintext for a single upstream. */
  async getKey(token: string, upstream: string): Promise<string> {
    const res = await this.request(
      'GET',
      `/manage/decrypt/${encodeURIComponent(upstream)}`,
      token,
    );
    if (res.status === 404) {
      throw new KeyNotFoundError(upstream);
    }
    if (!res.ok) {
      throw new Error(`getKey(${upstream}) failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { key?: string };
    if (!body.key) {
      throw new Error(`getKey(${upstream}) response missing \`key\` field`);
    }
    return body.key;
  }

  async storeKey(
    token: string,
    upstream: string,
    apiKey: string,
  ): Promise<void> {
    const res = await this.request('POST', '/manage/store', token, {
      upstream,
      apiKey,
    });
    if (!res.ok) {
      throw new Error(`storeKey(${upstream}) failed: HTTP ${res.status}`);
    }
  }

  async deleteKey(token: string, upstream: string): Promise<void> {
    const res = await this.request(
      'DELETE',
      `/manage/secret/${encodeURIComponent(upstream)}`,
      token,
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(`deleteKey(${upstream}) failed: HTTP ${res.status}`);
    }
  }

  // ─── Agents ────────────────────────────────────────────────────

  async registerAgent(
    token: string,
    pubkeyB58: string,
    name = 'agent',
    scopes = '*',
  ): Promise<RegisteredAgent> {
    const res = await this.request('POST', '/agents/register', token, {
      pubkeyB58,
      name,
      scopes,
    });
    if (!res.ok) {
      throw new Error(`registerAgent failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as RegisteredAgent;
    return body;
  }

  async listAgents(token: string): Promise<AgentRecord[]> {
    const res = await this.request('GET', '/agents/list', token);
    if (!res.ok) {
      throw new Error(`listAgents failed: HTTP ${res.status}`);
    }
    const body = (await res.json()) as { agents?: AgentRecord[] };
    return body.agents ?? [];
  }

  async revokeAgent(token: string, agentId: number): Promise<void> {
    const res = await this.request(
      'DELETE',
      `/agents/${agentId}`,
      token,
    );
    if (res.status === 404) {
      throw new AgentNotFoundError(agentId);
    }
    if (!res.ok) {
      throw new Error(`revokeAgent(${agentId}) failed: HTTP ${res.status}`);
    }
  }

  private async request(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    bearer?: string,
    body?: unknown,
  ): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(t);
    }
  }
}

export class KeyNotFoundError extends Error {
  constructor(public readonly upstream: string) {
    super(`key for upstream "${upstream}" not found on server`);
    this.name = 'KeyNotFoundError';
  }
}

export class AgentNotFoundError extends Error {
  constructor(public readonly agentId: number) {
    super(`agent #${agentId} not found on server`);
    this.name = 'AgentNotFoundError';
  }
}

export interface AgentRecord {
  id: number;
  pubkey_b58: string;
  name: string;
  scopes: string;
  created_at: number;
  last_used_at: number | null;
}

export interface RegisteredAgent {
  ok: boolean;
  agentId: number;
  name: string;
  pubkey: string;
}
