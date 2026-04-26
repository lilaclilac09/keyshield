import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnlockScreen } from './UnlockScreen';
import type { Services } from '../wiring';

// Minimal mock services — only AuthService is exercised by UnlockScreen.
// Path A AuthResult includes prfSecret; mock returns 32 zero bytes.
const MOCK_PRF = new Uint8Array(32);

function makeServices(authOverrides: Partial<any> = {}): Services {
  return {
    auth: {
      registerPasskey: vi.fn(async () => ({
        success: true,
        credentialId: 'new',
        prfSecret: MOCK_PRF,
      })),
      authenticateWithWebAuthn: vi.fn(async () => ({
        success: true,
        credentialId: 'old',
        prfSecret: MOCK_PRF,
      })),
      isWebAuthnAvailable: vi.fn(() => true),
      ...authOverrides,
    } as any,
    vault: {} as any,
    sync: {} as any,
    syncAuth: null,
    bearer: {} as any,
    session: {} as any,
  };
}

describe('UnlockScreen — lost-device link', () => {
  it('does NOT render the "Lost a device?" link when onLostDevice is omitted', () => {
    const services = makeServices();
    render(
      <UnlockScreen
        mode="firstRun"
        services={services}
        onFirstRunComplete={async () => {}}
        onUnlock={async () => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /lost a device/i })).toBeNull();
  });

  it('renders + fires onLostDevice when provided in firstRun mode', async () => {
    const services = makeServices();
    const onLostDevice = vi.fn();
    render(
      <UnlockScreen
        mode="firstRun"
        services={services}
        onFirstRunComplete={async () => {}}
        onUnlock={async () => {}}
        onLostDevice={onLostDevice}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /lost a device/i }),
    );
    expect(onLostDevice).toHaveBeenCalledOnce();
  });

  it('does NOT render the link in locked mode (locked-mode users have a passkey already)', () => {
    const services = makeServices();
    render(
      <UnlockScreen
        mode="locked"
        services={services}
        onFirstRunComplete={async () => {}}
        onUnlock={async () => {}}
        onLostDevice={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /lost a device/i })).toBeNull();
  });
});

describe('UnlockScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('first-run: clicking the button calls registerPasskey then onFirstRunComplete', async () => {
    const services = makeServices();
    const onFirstRunComplete = vi.fn(async () => {});
    const onUnlock = vi.fn(async () => {});
    render(
      <UnlockScreen
        mode="firstRun"
        services={services}
        onFirstRunComplete={onFirstRunComplete}
        onUnlock={onUnlock}
      />,
    );
    expect(screen.getByText(/set up your vault/i)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /create vault with face id/i }),
    );
    await waitFor(() => {
      expect(services.auth.registerPasskey).toHaveBeenCalledOnce();
      expect(onFirstRunComplete).toHaveBeenCalledOnce();
    });
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('locked: clicking the button calls authenticateWithWebAuthn then onUnlock', async () => {
    const services = makeServices();
    const onFirstRunComplete = vi.fn(async () => {});
    const onUnlock = vi.fn(async () => {});
    render(
      <UnlockScreen
        mode="locked"
        services={services}
        onFirstRunComplete={onFirstRunComplete}
        onUnlock={onUnlock}
      />,
    );
    expect(screen.getByText(/welcome back/i)).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole('button', { name: /unlock with face id/i }),
    );
    await waitFor(() => {
      expect(services.auth.authenticateWithWebAuthn).toHaveBeenCalledOnce();
      expect(onUnlock).toHaveBeenCalledOnce();
    });
    expect(onFirstRunComplete).not.toHaveBeenCalled();
  });

  it('shows the error message when WebAuthn returns success=false', async () => {
    const services = makeServices({
      authenticateWithWebAuthn: vi.fn(async () => ({
        success: false,
        error: 'Authentication cancelled',
      })),
    });
    render(
      <UnlockScreen
        mode="locked"
        services={services}
        onFirstRunComplete={vi.fn()}
        onUnlock={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /unlock with face id/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/Authentication cancelled/)).toBeInTheDocument();
    });
  });

  it('shows the error message when registration throws', async () => {
    const services = makeServices({
      registerPasskey: vi.fn(async () => {
        throw new Error('platform refused');
      }),
    });
    render(
      <UnlockScreen
        mode="firstRun"
        services={services}
        onFirstRunComplete={vi.fn()}
        onUnlock={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: /create vault with face id/i }),
    );
    await waitFor(() => {
      expect(screen.getByText(/platform refused/)).toBeInTheDocument();
    });
  });
});
