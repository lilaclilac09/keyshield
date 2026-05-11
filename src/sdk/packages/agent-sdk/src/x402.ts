const DEFAULT_API_URL = 'https://keyshield-production.up.railway.app';

export interface X402PaymentDetails {
  amount: number;
  upstream: string;
  payTo?: string;
}

export interface StreamState {
  streamId: number;
  upstream: string;
  pendingMicroUsdc: number;
  settledMicroUsdc: number;
  status: 'open' | 'closed';
}

export interface OpenStreamOptions {
  ratePerCallMicroUsdc?: number;
  ratePerTokenMicroUsdc?: number;
  settlementIntervalSecs?: number;
  agentPubkey?: string;
  agentName?: string;
}

export class X402Client {
  private apiUrl: string;
  private token: string | null = null;
  private streams: Map<string, StreamState> = new Map();

  constructor(apiUrl?: string) {
    this.apiUrl = (apiUrl ?? DEFAULT_API_URL).replace(/\/$/, '');
  }

  setToken(token: string): void {
    this.token = token;
  }

  private requireToken(): string {
    if (!this.token) {
      throw new Error('X402Client: call setToken() before making requests');
    }
    return this.token;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.requireToken()}` };
  }

  static parsePaymentDetails(res: Response): X402PaymentDetails | null {
    const raw = res.headers.get('X-Payment-Required') ?? res.headers.get('X-Payment-Details');
    if (!raw) return null;

    const pairs: Record<string, string> = {};
    for (const part of raw.trim().split(/\s+/)) {
      const eq = part.indexOf('=');
      if (eq === -1) continue;
      pairs[part.slice(0, eq)] = part.slice(eq + 1);
    }

    const amount = Number(pairs['amount']);
    const upstream = pairs['upstream'];
    if (!upstream || isNaN(amount)) return null;

    return {
      amount,
      upstream,
      payTo: pairs['payTo'] ?? pairs['pay_to'],
    };
  }

  async openStream(upstream: string, options: OpenStreamOptions = {}): Promise<StreamState> {
    const body = {
      upstream,
      rate_per_call_micro_usdc: options.ratePerCallMicroUsdc ?? 1000,
      rate_per_token_micro_usdc: options.ratePerTokenMicroUsdc ?? 1,
      settlement_interval_secs: options.settlementIntervalSecs ?? 60,
      agent_pubkey: options.agentPubkey ?? '',
      agent_name: options.agentName ?? 'keyshield-agent',
    };

    const res = await fetch(`${this.apiUrl}/mpp/streams`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`X402Client.openStream failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { stream_id: number; status: string };
    const state: StreamState = {
      streamId: data.stream_id,
      upstream,
      pendingMicroUsdc: 0,
      settledMicroUsdc: 0,
      status: data.status === 'open' ? 'open' : 'closed',
    };
    this.streams.set(upstream, state);
    return state;
  }

  async recordUsage(streamId: number, calls = 1, tokens = 0): Promise<void> {
    const res = await fetch(`${this.apiUrl}/mpp/streams/${streamId}/usage`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ calls, tokens }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`X402Client.recordUsage failed (${res.status}): ${text}`);
    }

    for (const state of this.streams.values()) {
      if (state.streamId === streamId) {
        state.pendingMicroUsdc += calls * 1000 + tokens;
        break;
      }
    }
  }

  async settle(streamId: number): Promise<{ settledMicroUsdc: number; txSignature?: string }> {
    const res = await fetch(`${this.apiUrl}/mpp/streams/${streamId}/settle`, {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`X402Client.settle failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as {
      settled_micro_usdc: number;
      tx_signature?: string;
    };

    for (const state of this.streams.values()) {
      if (state.streamId === streamId) {
        state.settledMicroUsdc += data.settled_micro_usdc;
        state.pendingMicroUsdc = 0;
        break;
      }
    }

    return {
      settledMicroUsdc: data.settled_micro_usdc,
      txSignature: data.tx_signature,
    };
  }

  async closeStream(streamId: number): Promise<void> {
    await this.settle(streamId).catch(() => {});

    const res = await fetch(`${this.apiUrl}/mpp/streams/${streamId}`, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`X402Client.closeStream failed (${res.status}): ${text}`);
    }

    for (const [upstream, state] of this.streams.entries()) {
      if (state.streamId === streamId) {
        state.status = 'closed';
        this.streams.delete(upstream);
        break;
      }
    }
  }

  async listStreams(): Promise<StreamState[]> {
    const res = await fetch(`${this.apiUrl}/mpp/streams`, {
      headers: this.authHeaders(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`X402Client.listStreams failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as Array<{
      id: number;
      upstream: string;
      status: string;
      pending_micro_usdc?: number;
      settled_micro_usdc?: number;
    }>;

    return data.map((s) => ({
      streamId: s.id,
      upstream: s.upstream,
      pendingMicroUsdc: s.pending_micro_usdc ?? 0,
      settledMicroUsdc: s.settled_micro_usdc ?? 0,
      status: s.status === 'open' ? 'open' : 'closed',
    }));
  }

  async wrapFetch(
    url: string,
    options: RequestInit & { upstream?: string } = {},
  ): Promise<Response> {
    const { upstream, ...fetchOptions } = options;

    const res = await fetch(url, fetchOptions);

    if (res.status !== 402) return res;

    const details = X402Client.parsePaymentDetails(res);
    const resolvedUpstream = details?.upstream ?? upstream ?? 'unknown';
    const amount = details?.amount ?? 1000;

    let state = this.streams.get(resolvedUpstream);
    if (!state || state.status === 'closed') {
      state = await this.openStream(resolvedUpstream);
    }

    const retryHeaders = new Headers((fetchOptions.headers as HeadersInit | undefined) ?? {});
    retryHeaders.set('X-Payment-Stream-Id', String(state.streamId));
    retryHeaders.set('X-Payment-Amount', String(amount));

    return fetch(url, { ...fetchOptions, headers: retryHeaders });
  }

  getStream(upstream: string): StreamState | undefined {
    return this.streams.get(upstream);
  }
}
