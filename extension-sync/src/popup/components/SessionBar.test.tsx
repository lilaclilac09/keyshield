import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionBar } from './SessionBar';

const baseSession = {
  ephemeralPubkey: 'EphPK',
  expiresAt: 0,
  createdAt: 0,
  deviceLabel: 'My Mac',
};

function setup(overrides: any = {}) {
  const onRenew = vi.fn();
  const onRevokeAll = vi.fn();
  render(
    <SessionBar
      countdown={{
        session: baseSession,
        secondsRemaining: 1800,
        nearExpiry: false,
        ...overrides,
      }}
      onRenew={onRenew}
      onRevokeAll={onRevokeAll}
    />,
  );
  return { onRenew, onRevokeAll };
}

describe('SessionBar', () => {
  it('shows the session countdown formatted as h/m', () => {
    setup({ secondsRemaining: 3600 + 30 * 60 });
    expect(screen.getByText(/1h 30m/)).toBeInTheDocument();
    expect(screen.getByText(/My Mac/)).toBeInTheDocument();
  });

  it('formats sub-minute remaining as seconds', () => {
    setup({ secondsRemaining: 45 });
    expect(screen.getByText(/45s/)).toBeInTheDocument();
  });

  it('hides the Renew button when not near expiry', () => {
    setup({ nearExpiry: false });
    expect(screen.queryByRole('button', { name: /renew/i })).toBeNull();
  });

  it('shows Renew when near expiry', () => {
    setup({ nearExpiry: true });
    expect(screen.getByRole('button', { name: /renew/i })).toBeInTheDocument();
  });

  it('clicking Revoke all calls the handler', async () => {
    const { onRevokeAll } = setup();
    await userEvent.click(screen.getByRole('button', { name: /revoke all/i }));
    expect(onRevokeAll).toHaveBeenCalledOnce();
  });

  it('clicking Renew (when near expiry) calls the handler', async () => {
    const { onRenew } = setup({ nearExpiry: true });
    await userEvent.click(screen.getByRole('button', { name: /renew/i }));
    expect(onRenew).toHaveBeenCalledOnce();
  });

  it('renders the no-session state when session is null', () => {
    setup({ session: null, secondsRemaining: null, nearExpiry: false });
    expect(screen.getByText(/no active on-chain session/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revoke all/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /renew/i })).toBeNull();
  });

  it('disables both buttons when disabled=true', () => {
    const onRenew = vi.fn();
    const onRevokeAll = vi.fn();
    render(
      <SessionBar
        countdown={{
          session: baseSession,
          secondsRemaining: 60,
          nearExpiry: true,
        }}
        onRenew={onRenew}
        onRevokeAll={onRevokeAll}
        disabled
      />,
    );
    expect(screen.getByRole('button', { name: /renew/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /revoke all/i })).toBeDisabled();
  });
});
