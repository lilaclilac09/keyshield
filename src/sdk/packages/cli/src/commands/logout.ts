import { V2Client } from '../lib/v2-client.js';
import { clearSession, loadSession } from '../lib/session-store.js';

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
  process.stdout.write(`logged out from ${session.server}\n`);
  return 0;
}
