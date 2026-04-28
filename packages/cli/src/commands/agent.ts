/**
 * `keyshield agent ...` subcommands. v2-mvp lets you register an
 * ed25519 pubkey under a user account so that agent can later
 * authenticate autonomously via `/auth/agent-login`. The CLI gives
 * the human-side management surface:
 *
 *   keyshield agent list                      → /agents/list
 *   keyshield agent revoke <id>               → /agents/{id} DELETE
 *   keyshield agent register <pubkey> ...     → /agents/register
 */

import { V2Client, AgentNotFoundError } from '../lib/v2-client.js';
import { loadSession } from '../lib/session-store.js';

async function clientFromSession(): Promise<{
  client: V2Client;
  token: string;
  server: string;
} | null> {
  const session = await loadSession();
  if (!session) {
    process.stderr.write(
      'not logged in. Run `keyshield login` first — agent commands need a v2-mvp server.\n',
    );
    return null;
  }
  return {
    client: new V2Client({ baseUrl: session.server }),
    token: session.token,
    server: session.server,
  };
}

export interface AgentListOptions {
  json?: boolean;
}

export async function runAgentList(
  opts: AgentListOptions = {},
): Promise<number> {
  const ctx = await clientFromSession();
  if (!ctx) return 1;
  const agents = await ctx.client.listAgents(ctx.token);

  if (opts.json) {
    process.stdout.write(JSON.stringify(agents, null, 2) + '\n');
    return 0;
  }

  if (agents.length === 0) {
    process.stderr.write(`(no agents registered on ${ctx.server})\n`);
    return 0;
  }

  // Plain text table: id, name, pubkey (truncated), scopes, created, last-used.
  const fmtTime = (t: number | null) => {
    if (!t) return 'never';
    const d = new Date(t * 1000);
    return d.toISOString().slice(0, 19).replace('T', ' ');
  };
  const truncatePubkey = (p: string) =>
    p.length > 12 ? `${p.slice(0, 6)}…${p.slice(-4)}` : p;

  process.stdout.write(
    'ID   NAME                 PUBKEY        SCOPES   LAST USED\n',
  );
  for (const a of agents) {
    process.stdout.write(
      `${String(a.id).padEnd(4)} ${a.name.slice(0, 20).padEnd(20)} ` +
        `${truncatePubkey(a.pubkey_b58).padEnd(13)} ${a.scopes.padEnd(8)} ` +
        `${fmtTime(a.last_used_at)}\n`,
    );
  }
  return 0;
}

export interface AgentRevokeOptions {
  force?: boolean;
}

export async function runAgentRevoke(
  agentIdRaw: string,
  opts: AgentRevokeOptions = {},
): Promise<number> {
  const agentId = Number(agentIdRaw);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    process.stderr.write(`invalid agent id: ${agentIdRaw}\n`);
    return 64;
  }

  const ctx = await clientFromSession();
  if (!ctx) return 1;

  if (!opts.force && process.stdin.isTTY) {
    process.stdout.write(`Revoke agent #${agentId}? [y/N] `);
    const answer = await new Promise<string>((resolve) => {
      let buf = '';
      process.stdin.setEncoding('utf8');
      const onData = (chunk: string) => {
        buf += chunk;
        if (buf.includes('\n')) {
          process.stdin.removeListener('data', onData);
          process.stdin.pause();
          resolve(buf.trim().toLowerCase());
        }
      };
      process.stdin.resume();
      process.stdin.on('data', onData);
    });
    if (answer !== 'y' && answer !== 'yes') {
      process.stdout.write('cancelled.\n');
      return 0;
    }
  }

  try {
    await ctx.client.revokeAgent(ctx.token, agentId);
  } catch (e: any) {
    if (e instanceof AgentNotFoundError) {
      process.stderr.write(`agent #${agentId} not found\n`);
      return 1;
    }
    process.stderr.write(`revoke failed: ${e?.message ?? e}\n`);
    return 1;
  }
  process.stdout.write(`revoked agent #${agentId}\n`);
  return 0;
}

export interface AgentRegisterOptions {
  name?: string;
  scopes?: string;
}

export async function runAgentRegister(
  pubkeyB58: string,
  opts: AgentRegisterOptions = {},
): Promise<number> {
  const ctx = await clientFromSession();
  if (!ctx) return 1;

  // Light validation — base58 alphabet + plausible ed25519 pubkey
  // length (32 bytes → ~44 base58 chars).
  if (!/^[1-9A-HJ-NP-Za-km-z]+$/.test(pubkeyB58)) {
    process.stderr.write('pubkey is not valid base58\n');
    return 64;
  }
  if (pubkeyB58.length < 32 || pubkeyB58.length > 50) {
    process.stderr.write(
      `pubkey length looks wrong (${pubkeyB58.length} chars; expected ~44)\n`,
    );
    return 64;
  }

  let result;
  try {
    result = await ctx.client.registerAgent(
      ctx.token,
      pubkeyB58,
      opts.name ?? 'agent',
      opts.scopes ?? '*',
    );
  } catch (e: any) {
    process.stderr.write(`register failed: ${e?.message ?? e}\n`);
    return 1;
  }
  process.stdout.write(
    `registered agent #${result.agentId} "${result.name}" with pubkey ${result.pubkey}\n`,
  );
  return 0;
}
