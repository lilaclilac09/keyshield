import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddPasskeyBanner } from './AddPasskeyBanner';

const FAKE_PRF = new Uint8Array(32).fill(0xab);

function makeServices(overrides: Partial<any> = {}): any {
  return {
    auth: {
      registerPasskey: vi.fn(async () => ({
        success: true,
        credentialId: 'new-cred',
        prfSecret: FAKE_PRF,
        registrationResponseJSON: { id: 'new-cred' },
        expectedChallenge: 'chal',
      })),
      ...overrides.auth,
    },
    vault: {} as any,
    sync: {} as any,
    syncAuth: null,
    bearer: {} as any,
    session: {} as any,
  };
}

describe('AddPasskeyBanner', () => {
  it('renders the restored-from-recovery message and CTA', () => {
    render(
      <AddPasskeyBanner services={makeServices()} onRegistered={async () => {}} />,
    );
    expect(screen.getByText(/restored from recovery phrase/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /add passkey/i }),
    ).toBeInTheDocument();
  });

  it('calls registerPasskey then onRegistered with the result', async () => {
    const services = makeServices();
    const onRegistered = vi.fn(async () => {});
    render(<AddPasskeyBanner services={services} onRegistered={onRegistered} />);
    await userEvent.click(screen.getByRole('button', { name: /add passkey/i }));
    await waitFor(() => {
      expect(services.auth.registerPasskey).toHaveBeenCalledOnce();
      expect(onRegistered).toHaveBeenCalledOnce();
    });
    const callArg = (onRegistered.mock.calls[0] as any[])[0];
    expect(callArg.success).toBe(true);
    expect(Array.from(callArg.prfSecret)).toEqual(Array.from(FAKE_PRF));
  });

  it('surfaces an error from registerPasskey without calling onRegistered', async () => {
    const services = makeServices({
      auth: {
        registerPasskey: vi.fn(async () => ({
          success: false,
          error: 'user cancelled',
        })),
      },
    });
    const onRegistered = vi.fn(async () => {});
    render(<AddPasskeyBanner services={services} onRegistered={onRegistered} />);
    await userEvent.click(screen.getByRole('button', { name: /add passkey/i }));
    await waitFor(() => {
      expect(screen.getByText(/user cancelled/i)).toBeInTheDocument();
    });
    expect(onRegistered).not.toHaveBeenCalled();
  });

  it('surfaces a thrown error from onRegistered', async () => {
    const services = makeServices();
    const onRegistered = vi.fn(async () => {
      throw new Error('post-restore wrap failed');
    });
    render(<AddPasskeyBanner services={services} onRegistered={onRegistered} />);
    await userEvent.click(screen.getByRole('button', { name: /add passkey/i }));
    await waitFor(() => {
      expect(screen.getByText(/post-restore wrap failed/i)).toBeInTheDocument();
    });
  });

  it('disables the button while in flight', async () => {
    let release!: () => void;
    const services = makeServices({
      auth: {
        registerPasskey: vi.fn(
          () =>
            new Promise<any>((resolve) => {
              release = () =>
                resolve({
                  success: true,
                  credentialId: 'c',
                  prfSecret: FAKE_PRF,
                });
            }),
        ),
      },
    });
    render(<AddPasskeyBanner services={services} onRegistered={async () => {}} />);
    const btn = screen.getByRole('button', { name: /add passkey/i });
    await userEvent.click(btn);
    expect(btn).toBeDisabled();
    expect(screen.getByRole('button', { name: /adding/i })).toBeInTheDocument();
    release();
    await waitFor(() => expect(btn).not.toBeDisabled());
  });
});
