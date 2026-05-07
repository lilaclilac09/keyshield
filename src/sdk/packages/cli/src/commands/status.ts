import { defaultSessionPath, loadSession } from '../lib/session-store.js';
import { resolveEnvPath } from '../lib/load-env.js';
import { promises as fs } from 'node:fs';

export async function runStatus(): Promise<number> {
  const session = await loadSession();
  if (session) {
    const ageSecs = Math.floor(Date.now() / 1000) - session.createdAt;
    const mins = Math.floor(ageSecs / 60);
    process.stdout.write(
      [
        `mode:    v2-mvp server (logged in)`,
        `server:  ${session.server}`,
        `user:    ${session.userId}`,
        `since:   ${mins}m ago`,
        `session: ${defaultSessionPath()}`,
      ].join('\n') + '\n',
    );
    return 0;
  }

  // No session — report local-env mode.
  const envPath = await resolveEnvPath();
  let envExists = false;
  try {
    await fs.access(envPath);
    envExists = true;
  } catch {
    /* no env */
  }
  process.stdout.write(
    [
      `mode:    local env file (no server session)`,
      `env:     ${envPath}${envExists ? '' : ' (missing)'}`,
      ``,
      `to log into a v2-mvp server:`,
      `  keyshield login --server <url> --user <id>`,
      `to use a popup-exported .env file:`,
      `  open the popup, click "Export .env", save to ./.env`,
    ].join('\n') + '\n',
  );
  return envExists ? 0 : 1;
}
