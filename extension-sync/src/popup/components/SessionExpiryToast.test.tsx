import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionExpiryToast } from './SessionExpiryToast';
import type { SessionCountdown } from '../hooks/useSessionCountdown';

const baseSession = {
  ephemeralPubkey: 'session-A',
  expiresAt: 0,
  createdAt: 0,
  deviceLabel: 'My Mac',
};

function makeCountdown(over: Partial<SessionCountdown> = {}): SessionCountdown {
  return {
    session: baseSession,
    secondsRemaining: 200,
    nearExpiry: true,
    ...over,
  };
}

describe('SessionExpiryToast', () => {
  it('renders nothing when not near expiry', () => {
    const { container } = render(
      <SessionExpiryToast
        countdown={makeCountdown({ nearExpiry: false })}
        onRenew={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when there is no session', () => {
    const { container } = render(
      <SessionExpiryToast
        countdown={makeCountdown({
          session: null,
          secondsRemaining: null,
          nearExpiry: false,
        })}
        onRenew={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when secondsRemaining is +Infinity (no-expiry session)', () => {
    const { container } = render(
      <SessionExpiryToast
        countdown={makeCountdown({ secondsRemaining: Number.POSITIVE_INFINITY })}
        onRenew={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows the time-remaining headline (m / s formatting)', () => {
    render(
      <SessionExpiryToast
        countdown={makeCountdown({ secondsRemaining: 245 })}
        onRenew={() => {}}
      />,
    );
    // 245s → 4m 5s
    expect(screen.getByText(/4m 5s/)).toBeInTheDocument();
  });

  it('renders sub-minute remaining as plain seconds', () => {
    render(
      <SessionExpiryToast
        countdown={makeCountdown({ secondsRemaining: 42 })}
        onRenew={() => {}}
      />,
    );
    expect(screen.getByText(/42s/)).toBeInTheDocument();
  });

  it('clicking Renew now invokes onRenew and dismisses the toast', async () => {
    const onRenew = vi.fn(async () => {});
    const { rerender, container } = render(
      <SessionExpiryToast countdown={makeCountdown()} onRenew={onRenew} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /renew now/i }));
    expect(onRenew).toHaveBeenCalledOnce();
    // After dismissal the toast disappears for THIS session.
    rerender(
      <SessionExpiryToast countdown={makeCountdown()} onRenew={onRenew} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('clicking Dismiss hides the toast for the current session', async () => {
    const { rerender, container } = render(
      <SessionExpiryToast countdown={makeCountdown()} onRenew={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^dismiss$/i }));
    rerender(
      <SessionExpiryToast countdown={makeCountdown()} onRenew={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('re-arms when a new session ID appears (different ephemeral pubkey)', async () => {
    const { rerender } = render(
      <SessionExpiryToast countdown={makeCountdown()} onRenew={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /^dismiss$/i }));
    // Simulate a session renewal — same ephemeral pubkey would be
    // suppressed; a NEW ephemeral pubkey re-arms the warning.
    rerender(
      <SessionExpiryToast
        countdown={makeCountdown({
          session: { ...baseSession, ephemeralPubkey: 'session-B' },
        })}
        onRenew={() => {}}
      />,
    );
    expect(screen.getByText(/session expires in/i)).toBeInTheDocument();
  });
});
