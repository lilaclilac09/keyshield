import { useEffect, useState } from 'react';
import type { Services } from '../wiring';
import type { SessionState } from '../../lib/session';

export interface SessionCountdown {
  session: SessionState | null;
  secondsRemaining: number | null;
  nearExpiry: boolean;
}

/**
 * Polls ExtensionSession once per second and returns the current view of
 * the active session for the SessionBar. Kept out of useVaultFlow because
 * the countdown re-renders a lot and we don't want those renders to blow
 * away vault state.
 */
export function useSessionCountdown(services: Services): SessionCountdown {
  const [snapshot, setSnapshot] = useState<SessionCountdown>({
    session: null,
    secondsRemaining: null,
    nearExpiry: false,
  });

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      const [session, secondsRemaining, nearExpiry] = await Promise.all([
        services.session.getSession(),
        services.session.secondsRemaining(),
        services.session.isNearExpiry(),
      ]);
      if (!cancelled) setSnapshot({ session, secondsRemaining, nearExpiry });
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [services]);

  return snapshot;
}
