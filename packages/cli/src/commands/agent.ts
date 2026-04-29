/**
 * `keyshield agent ...` subcommands. v2-mvp lets you register an
 * ed25519 pubkey under a user account so that agent can later
 * authenticate autonomously via `/auth/agent-login`. The CLI gives
 * the human-side management surface:
 *
 *   keyshield agent list                      → /agents/list
 *   keyshield agent revoke <id>               → /agents/{id} DELETE
 *   keyshield agent register <pubkey> ...     → /agents/register
 *   keyshield agent create <name> ...         → gen keypair locally + register
 *   keyshield agent login <name>              → challenge-sign-login, save session
 */

import { V2Client, AgentNotFoundError } from '../lib/v2-client.js';
import { loadSession, saveSession } from '../lib/session-store.js';
import { promptPassword } from '../lib/prompt-password.js';
import {
  generateKeyPair,
  sign,
  base58Encode,
  base64Encode,
} from '../lib/ed25519.js';
import {
  loadAgent,
  saveAgent,
  listAgents,
  type StoredAgent,
} from '../lib/agent-store.js';

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

export interface AgentCreateOptions {
  scopes?: string;
  /** Don't write to disk — just print the generated material. Useful
   *  when the user wants to ship the seed somewhere else themselves. */
  print?: boolean;
}

/**
 * `keyshield agent create <name>` — generate an ed25519 keypair,
 * persist it under ~/.config/keyshield/agents/<name>.json, then
 * register the pubkey with the v2-mvp server. Idempotent up to the
 * filename: if `<name>` already exists locally, refuse to clobber.
 */
export async function runAgentCreate(
  name: string,
  opts: AgentCreateOptions = {},
): Promise<number> {
  const ctx = await clientFromSession();
  if (!ctx) return 1;

  if (!opts.print) {
    const existing = await loadAgent(name).catch(() => null);
    if (existing) {
      process.stderr.write(
        `agent "${name}" already exists locally. Pick a different name or delete the file first.\n`,
      );
      return 1;
    }
  }

  const session = await loadSession();
  if (!session) {
    // Defensive — clientFromSession already guarded, but TS narrowing.
    return 1;
  }

  const kp = generateKeyPair();
  const pubkey_b58 = base58Encode(kp.publicKey);
  const secret_b64 = base64Encode(kp.secretKey);

  let result;
  try {
    result = await ctx.client.registerAgent(
      ctx.token,
      pubkey_b58,
      name,
      opts.scopes ?? '*',
    );
  } catch (e: any) {
    process.stderr.write(`register failed: ${e?.message ?? e}\n`);
    return 1;
  }

  if (opts.print) {
    process.stdout.write(
      JSON.stringify(
        {
          name,
          pubkey_b58,
          secret_b64,
          server: ctx.server,
          ownerWallet: session.userId,
          agentId: result.agentId,
        },
        null,
        2,
      ) + '\n',
    );
    return 0;
  }

  const stored: StoredAgent = {
    name,
    pubkey_b58,
    secret_b64,
    server: ctx.server,
    ownerWallet: session.userId,
    agentId: result.agentId,
    createdAt: Math.floor(Date.now() / 1000),
  };
  await saveAgent(stored);

  process.stdout.write(
    `created agent "${name}" (#${result.agentId})\n` +
      `  pubkey:  ${pubkey_b58}\n` +
      `  server:  ${ctx.server}\n` +
      `  owner:   ${session.userId}\n` +
      `  saved:   ${process.env.XDG_CONFIG_HOME ?? '~'}/.config/keyshield/agents/${name}.json (mode 0600)\n` +
      `\n` +
      `Use it:\n` +
      `  keyshield agent login ${name}\n` +
      `  keyshield run -- node my-agent.js\n`,
  );
  return 0;
}


export interface AgentLoginOptions {
  /** Owner vault passphrase. Falls back to $KEYSHIELD_PASSWORD or TTY prompt. */
  passphrase?: string;
}

/**
 * `keyshield agent login <name>` — sign the server's challenge with the
 * stored agent secret, exchange for a session token, save the token as
 * the active session. After this, normal `keyshield run` calls bill
 * against the *agent's* balance (caller_id wiring), not the owner's.
 */
export async function runAgentLogin(
  name: string,
  opts: AgentLoginOptions = {},
): Promise<number> {
  const stored = await loadAgent(name);
  if (!stored) {
    process.stderr.write(
      `no agent "${name}" found. Create one with: keyshield agent create ${name}\n`,
    );
    return 1;
  }

  let passphrase = opts.passphrase ?? process.env.KEYSHIELD_PASSWORD;
  if (!passphrase) {
    try {
      passphrase = await promptPassword(
        `Owner vault passphrase for ${stored.ownerWallet} @ ${stored.server}: `,
      );
    } catch (e: any) {
      process.stderr.write(`${e?.message ?? e}\n`);
      return 130;
    }
  }
  if (!passphrase) {
    process.stderr.write('empty passphrase — aborted.\n');
    return 64;
  }

  const client = new V2Client({ baseUrl: stored.server });

  let challenge: string;
  try {
    const ch = await client.agentChallenge();
    challenge = ch.challenge;
  } catch (e: any) {
    process.stderr.write(`failed to get challenge: ${e?.message ?? e}\n`);
    return 1;
  }

  const secret = Uint8Array.from(Buffer.from(stored.secret_b64, 'base64'));
  const signature = sign(new TextEncoder().encode(challenge), secret);

  let token: string;
  try {
    token = await client.agentLogin({
      ownerWallet: stored.ownerWallet,
      agentPubkey: stored.pubkey_b58,
      signature: base64Encode(signature),
      challenge,
      passphrase,
    });
  } catch (e: any) {
    process.stderr.write(`agent-login failed: ${e?.message ?? e}\n`);
    return 1;
  }

  // Persist the resulting session as the active one — `keyshield run`
  // (and every other source-aware command) will pick it up
  // automatically and bill against the agent's balance.
  await saveSession({
    server: stored.server,
    userId: stored.ownerWallet,
    token,
    createdAt: Math.floor(Date.now() / 1000),
  });

  process.stdout.write(
    `logged in as agent "${name}" against ${stored.server}\n` +
      `  pubkey:  ${stored.pubkey_b58}\n` +
      `  owner:   ${stored.ownerWallet}\n` +
      `  billing: agent balance (caller_id = ${stored.pubkey_b58.slice(0, 8)}…)\n`,
  );
  return 0;
}


export async function runAgentLocalList(): Promise<number> {
  const names = await listAgents();
  if (names.length === 0) {
    process.stderr.write(
      `(no local agents in ~/.config/keyshield/agents/)\n`,
    );
    return 0;
  }
  for (const n of names) process.stdout.write(`${n}\n`);
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
