import { V2Client } from '../lib/v2-client.js';
import { clearSession, loadSession } from '../lib/session-store.js';
import { clearKeysCache } from '../lib/keys-cache.js';

export async function runLogout(): Promise<number> {
  const session = await loadSession();
  if (!session) {
    process.stderr.write('not logged in\n');
    return 0;
  }

  // Best-effort server-side delete. If the server is down we still
  // wipe the local file — the bearer is opaque, deleting it locally
  // is enough to "log out" from the user's POV.
  const client = new V2Client({ baseUrl: session.server });
  try {
    await client.logout(session.token);
  } catch (e: any) {
    process.stderr.write(
      `[keyshield] server logout failed (${e?.message ?? e}); clearing local session anyway\n`,
    );
  }
  await clearSession();
  // Drop any cached keys for this token so a stale process can't
  // serve them after the user has explicitly logged out.
  await clearKeysCache(session.token);
  process.stdout.write(`logged out from ${session.server}\n`);
  return 0;
}
