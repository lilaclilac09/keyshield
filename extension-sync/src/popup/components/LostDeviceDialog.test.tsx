import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LostDeviceDialog } from './LostDeviceDialog';

function setup() {
  const onStartRestore = vi.fn();
  const onClose = vi.fn();
  render(
    <LostDeviceDialog onStartRestore={onStartRestore} onClose={onClose} />,
  );
  return { onStartRestore, onClose };
}

describe('LostDeviceDialog', () => {
  it('renders the title and the three numbered steps', () => {
    setup();
    expect(screen.getByText(/lost a device/i)).toBeInTheDocument();
    expect(screen.getByText(/restore your vault here/i)).toBeInTheDocument();
    expect(screen.getByText(/add a passkey to this device/i)).toBeInTheDocument();
    expect(screen.getByText(/cut off the lost device/i)).toBeInTheDocument();
  });

  it('shows the honest caveat about V1.2 server-side revocation', () => {
    setup();
    expect(screen.getByText(/honest caveat/i)).toBeInTheDocument();
    expect(screen.getByText(/V1\.2 roadmap/i)).toBeInTheDocument();
  });

  it('clicking "Restore from phrase" fires onStartRestore but NOT onClose directly', async () => {
    const { onStartRestore, onClose } = setup();
    await userEvent.click(
      screen.getByRole('button', { name: /restore from phrase/i }),
    );
    expect(onStartRestore).toHaveBeenCalledOnce();
    // onClose is App.tsx's responsibility — the dialog itself doesn't
    // double-fire it. (App.tsx closes the dialog manually before
    // calling startRestore.)
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clicking Close fires onClose only', async () => {
    const { onStartRestore, onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onStartRestore).not.toHaveBeenCalled();
  });

  it('exposes a dialog role with an accessible label', () => {
    setup();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });
});
