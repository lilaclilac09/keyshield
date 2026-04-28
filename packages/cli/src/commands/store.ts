/**
 * `keyshield store <upstream>` — POST /manage/store on the v2-mvp
 * server. Reads the API-key value from stdin (default), an env var,
 * or a flag.
 *
 * stdin is the default to avoid leaving the secret in shell history.
 *   $ openssl rand -hex 32 | keyshield store openai
 *   $ keyshield store openai            # then paste + Enter, Ctrl-D
 */

import { V2Client } from '../lib/v2-client.js';
import { loadSession } from '../lib/session-store.js';
import { promptPassword } from '../lib/prompt-password.js';

export interface StoreOptions {
  /** Take the value from $KEYSHIELD_VALUE instead of stdin / prompt. */
  envVar?: string;
  /** Inline value via flag (NOT recommended — visible in shell history). */
  value?: string;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function runStore(
  upstream: string,
  opts: StoreOptions = {},
): Promise<number> {
  const session = await loadSession();
  if (!session) {
    process.stderr.write(
      'not logged in. Run `keyshield login` first — store needs a v2-mvp server.\n',
    );
    return 1;
  }

  let value = opts.value ?? '';
  if (!value && opts.envVar) value = process.env[opts.envVar] ?? '';

  if (!value) {
    if (process.stdin.isTTY) {
      // Interactive: prompt with hidden input.
      try {
        value = await promptPassword(`API key for ${upstream}: `);
      } catch (e: any) {
        process.stderr.write(`${e?.message ?? e}\n`);
        return 130;
      }
    } else {
      // Pipe: read whatever was piped in, strip a single trailing
      // newline (the shell adds one with `echo`).
      const piped = await readStdin();
      value = piped.replace(/\r?\n$/, '');
    }
  }

  if (!value) {
    process.stderr.write('empty value — refusing to store\n');
    return 64;
  }

  const client = new V2Client({ baseUrl: session.server });
  try {
    await client.storeKey(session.token, upstream, value);
  } catch (e: any) {
    process.stderr.write(`store failed: ${e?.message ?? e}\n`);
    return 1;
  }
  process.stdout.write(
    `stored ${upstream} (${value.length} chars) on ${session.server}\n`,
  );
  return 0;
}
