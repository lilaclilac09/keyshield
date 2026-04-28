import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RestoreScreen } from './RestoreScreen';
import { generateMnemonic } from '../../lib/mnemonic';

const VALID = generateMnemonic();

describe('RestoreScreen', () => {
  it('Restore button is disabled when input is empty', () => {
    render(<RestoreScreen onRestore={async () => {}} onCancel={() => {}} />);
    expect(
      screen.getByRole('button', { name: /restore vault/i }),
    ).toBeDisabled();
  });

  it('shows live word count while typing', async () => {
    render(<RestoreScreen onRestore={async () => {}} onCancel={() => {}} />);
    const ta = screen.getByLabelText(/recovery phrase input/i);
    await userEvent.type(ta, 'abandon ability able');
    expect(screen.getByText(/3 \/ 24 words/)).toBeInTheDocument();
  });

  it('shows checksum-failed hint on a 24-word phrase with wrong checksum', async () => {
    const m = VALID.split(' ');
    [m[0], m[23]] = [m[23], m[0]];
    render(<RestoreScreen onRestore={async () => {}} onCancel={() => {}} />);
    await userEvent.type(
      screen.getByLabelText(/recovery phrase input/i),
      m.join(' '),
    );
    // 24 words but checksum bad → "checksum failed" hint and Restore disabled
    expect(screen.getByText(/checksum failed/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /restore vault/i }),
    ).toBeDisabled();
  });

  it('enables Restore on a valid phrase and forwards the normalised value', async () => {
    const onRestore = vi.fn(async () => {});
    render(<RestoreScreen onRestore={onRestore} onCancel={() => {}} />);
    await userEvent.type(
      screen.getByLabelText(/recovery phrase input/i),
      VALID,
    );
    expect(screen.getByText(/phrase looks good/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /restore vault/i }));
    expect(onRestore).toHaveBeenCalledWith(VALID);
  });

  it('surfaces an error from onRestore', async () => {
    const onRestore = vi.fn(async () => {
      throw new Error('No vault for that phrase');
    });
    render(<RestoreScreen onRestore={onRestore} onCancel={() => {}} />);
    await userEvent.type(
      screen.getByLabelText(/recovery phrase input/i),
      VALID,
    );
    await userEvent.click(screen.getByRole('button', { name: /restore vault/i }));
    await waitFor(() =>
      expect(screen.getByText(/No vault for that phrase/i)).toBeInTheDocument(),
    );
  });

  it('Back button calls onCancel', async () => {
    const onCancel = vi.fn();
    render(<RestoreScreen onRestore={async () => {}} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /^back$/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
