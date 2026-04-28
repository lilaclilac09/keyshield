/**
 * Tests for the SessionBar's countdown hook.
 *
 * Pins the contract:
 *   - polls every 1s
 *   - keeps in sync with services.session.{getSession, secondsRemaining,
 *     isNearExpiry}
 *   - cleans up the interval on unmount (no leaked timers)
 *   - tolerates the session disappearing mid-poll (returns null nicely)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSessionCountdown } from './useSessionCountdown';

function fakeServices(initial: {
  session?: any;
  secondsRemaining?: number | null;
  nearExpiry?: boolean;
}) {
  const state = {
    session: initial.session ?? null,
    secondsRemaining: initial.secondsRemaining ?? null,
    nearExpiry: initial.nearExpiry ?? false,
  };
  return {
    state,
    services: {
      session: {
        getSession: vi.fn(async () => state.session),
        secondsRemaining: vi.fn(async () => state.secondsRemaining),
        isNearExpiry: vi.fn(async () => state.nearExpiry),
      },
    } as any,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSessionCountdown', () => {
  it('starts with the initial snapshot then resolves to live values', async () => {
    const { services, state } = fakeServices({
      session: { ephemeralPubkey: 'pk', expiresAt: 1, deviceLabel: 'mac' },
      secondsRemaining: 120,
      nearExpiry: false,
    });

    const { result } = renderHook(() => useSessionCountdown(services));

    // First synchronous render returns the placeholder.
    expect(result.current.session).toBeNull();

    await waitFor(() => {
      expect(result.current.session).toEqual(state.session);
      expect(result.current.secondsRemaining).toBe(120);
      expect(result.current.nearExpiry).toBe(false);
    });
  });

  it('re-polls every 1 second and updates secondsRemaining', async () => {
    const { services, state } = fakeServices({
      session: { ephemeralPubkey: 'pk', expiresAt: 1, deviceLabel: 'mac' },
      secondsRemaining: 60,
      nearExpiry: false,
    });

    const { result } = renderHook(() => useSessionCountdown(services));
    await waitFor(() => expect(result.current.secondsRemaining).toBe(60));

    // Mutate the backing state, then advance timers by 1s.
    state.secondsRemaining = 59;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await waitFor(() => expect(result.current.secondsRemaining).toBe(59));
  });

  it('flips nearExpiry true when the session crosses the threshold', async () => {
    const { services, state } = fakeServices({
      session: { ephemeralPubkey: 'pk', expiresAt: 1, deviceLabel: 'mac' },
      secondsRemaining: 600,
      nearExpiry: false,
    });

    const { result } = renderHook(() => useSessionCountdown(services));
    await waitFor(() => expect(result.current.nearExpiry).toBe(false));

    state.secondsRemaining = 60;
    state.nearExpiry = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await waitFor(() => expect(result.current.nearExpiry).toBe(true));
  });

  it('handles a session disappearing (null) without crashing', async () => {
    const { services, state } = fakeServices({
      session: { ephemeralPubkey: 'pk', expiresAt: 1, deviceLabel: 'mac' },
      secondsRemaining: 60,
      nearExpiry: false,
    });

    const { result } = renderHook(() => useSessionCountdown(services));
    await waitFor(() => expect(result.current.session).not.toBeNull());

    state.session = null;
    state.secondsRemaining = null;
    state.nearExpiry = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await waitFor(() => expect(result.current.session).toBeNull());
  });

  it('stops polling on unmount (no further getSession calls)', async () => {
    const { services } = fakeServices({
      session: null,
      secondsRemaining: null,
      nearExpiry: false,
    });

    const { unmount } = renderHook(() => useSessionCountdown(services));
    // Wait for the initial tick to fire.
    await waitFor(() =>
      expect(
        (services.session.getSession as any).mock.calls.length,
      ).toBeGreaterThanOrEqual(1),
    );

    const baseline = (services.session.getSession as any).mock.calls.length;
    unmount();

    // Advance several seconds — without cleanup, this would queue 3+
    // more getSession calls. With the cleanup function in the effect,
    // the call count must stay flat.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect((services.session.getSession as any).mock.calls.length).toBe(baseline);
  });

  it('does not write state after unmount (cancelled flag honored)', async () => {
    let resolveGetSession!: (v: any) => void;
    const blocked = new Promise((r) => (resolveGetSession = r));

    const services: any = {
      session: {
        getSession: vi.fn(() => blocked),
        secondsRemaining: vi.fn(async () => null),
        isNearExpiry: vi.fn(async () => false),
      },
    };

    const errors: any[] = [];
    const origError = console.error;
    console.error = (...a) => errors.push(a);
    try {
      const { unmount } = renderHook(() => useSessionCountdown(services));
      unmount();
      // Resolve the in-flight call AFTER unmount; the hook should not
      // call setState (which would log a "state on unmounted" warning
      // in older React or throw in StrictMode).
      resolveGetSession({ ephemeralPubkey: 'pk', expiresAt: 1, deviceLabel: 'mac' });
      await Promise.resolve();
      await Promise.resolve();
    } finally {
      console.error = origError;
    }
    const stateOnUnmounted = errors.find((args) =>
      args.some((s: any) => typeof s === 'string' && s.includes('unmounted')),
    );
    expect(stateOnUnmounted).toBeUndefined();
  });
});
