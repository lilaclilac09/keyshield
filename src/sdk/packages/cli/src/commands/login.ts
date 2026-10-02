import { V2Client } from '../lib/v2-client.js';
import {
  defaultSessionPath,
  saveSession,
  type Session,
} from '../lib/session-store.js';
import { promptPassword } from '../lib/prompt-password.js';

export interface LoginOptions {
  /** v2-mvp server URL. Falls back to $KEYSHIELD_SERVER. */
  server?: string;
  /** Username. Falls back to $KEYSHIELD_USER. */
  user?: string;
  /** Password. Falls back to $KEYSHIELD_PASSWORD. Last resort: TTY prompt. */
  password?: string;
}

export async function runLogin(opts: LoginOptions = {}): Promise<number> {
  const server = opts.server ?? process.env.KEYSHIELD_SERVER ?? '';
  const userId = opts.user ?? process.env.KEYSHIELD_USER ?? '';
  if (!server) {
    process.stderr.write(
      'no server configured. Pass --server <url> or set KEYSHIELD_SERVER.\n',
    );
    return 64;
  }
  if (!userId) {
    process.stderr.write(
      'no user configured. Pass --user <id> or set KEYSHIELD_USER.\n',
    );
    return 64;
  }

  let password = opts.password ?? process.env.KEYSHIELD_PASSWORD;
  if (!password) {
    try {
      password = await promptPassword(`Password for ${userId} @ ${server}: `);
    } catch (e: any) {
      process.stderr.write(`${e?.message ?? e}\n`);
      return 130;
    }
  }
  if (!password) {
    process.stderr.write('empty password — aborted.\n');
    return 64;
  }

  const client = new V2Client({ baseUrl: server });
  let token: string;
  try {
    token = await client.login(userId, password);
  } catch (e: any) {
    const msg = e?.message ?? e;
    process.stderr.write(`login failed: ${msg}\n`);
    if (String(msg).includes('direct login disabled')) {
      process.stderr.write(
        'hint: password login is 403. Use wallet/passkey, or export KS_TOKEN / KEYSHIELD_TOKEN from the dashboard.\n',
      );
    }
    return 1;
  }

  const session: Session = {
    server,
    userId,
    token,
    createdAt: Math.floor(Date.now() / 1000),
  };
  await saveSession(session);
  process.stdout.write(
    `logged in as ${userId} @ ${server}\n` +
      `session saved to ${defaultSessionPath()}\n`,
  );
  return 0;
}
