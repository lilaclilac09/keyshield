/**
 * `keyshield delete <upstream>` — DELETE /manage/secret/<upstream>.
 * Tolerates 404 (already gone). Requires v2-mvp server session.
 */

import { V2Client } from '../lib/v2-client.js';
import { loadSession } from '../lib/session-store.js';

export interface DeleteOptions {
  /** Skip the "are you sure?" prompt. Required in non-TTY runs. */
  force?: boolean;
}

export async function runDelete(
  upstream: string,
  opts: DeleteOptions = {},
): Promise<number> {
  const session = await loadSession();
  if (!session) {
    process.stderr.write(
      'not logged in. Run `keyshield login` first — delete needs a v2-mvp server.\n',
    );
    return 1;
  }

  if (!opts.force) {
    if (!process.stdin.isTTY) {
      process.stderr.write(
        `refusing to delete ${upstream} non-interactively without --force\n`,
      );
      return 64;
    }
    process.stdout.write(
      `Delete key "${upstream}" from ${session.server}? [y/N] `,
    );
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

  const client = new V2Client({ baseUrl: session.server });
  try {
    await client.deleteKey(session.token, upstream);
  } catch (e: any) {
    process.stderr.write(`delete failed: ${e?.message ?? e}\n`);
    return 1;
  }
  process.stdout.write(`deleted ${upstream} from ${session.server}\n`);
  return 0;
}
