import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConflictDialog } from './ConflictDialog';
import type { KeyConflict } from '../../lib/conflict';

const conflicts: KeyConflict[] = [
  {
    name: 'openai',
    mine: { value: 'sk-mine-1234567890', createdAt: 200 },
    theirs: { value: 'sk-theirs-9876543210', createdAt: 100 },
  },
  {
    name: 'stripe',
    mine: { value: 'sk_live_short', createdAt: 50 },
    theirs: { value: 'sk_live_othr', createdAt: 80 },
  },
];

function setup() {
  const onResolve = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConflictDialog
      conflicts={conflicts}
      onResolve={onResolve}
      onCancel={onCancel}
    />,
  );
  return { onResolve, onCancel };
}

describe('ConflictDialog', () => {
  it('lists every conflicted key', () => {
    setup();
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('stripe')).toBeInTheDocument();
  });

  it('masks values until reveal is clicked', async () => {
    setup();
    expect(screen.queryByText(/sk-mine-1234567890/)).toBeNull();
    expect(screen.queryByText(/sk-theirs-9876543210/)).toBeNull();
    await userEvent.click(screen.getAllByRole('button', { name: /^reveal$/i })[0]);
    expect(screen.getByText(/sk-mine-1234567890/)).toBeInTheDocument();
    expect(screen.getByText(/sk-theirs-9876543210/)).toBeInTheDocument();
  });

  it("defaults every key to 'theirs' (preserves what other devices saw)", async () => {
    const { onResolve } = setup();
    await userEvent.click(screen.getByRole('button', { name: /save merged/i }));
    expect(onResolve).toHaveBeenCalledWith({ openai: 'theirs', stripe: 'theirs' });
  });

  it('"Keep all mine" flips every conflict', async () => {
    const { onResolve } = setup();
    await userEvent.click(screen.getByRole('button', { name: /keep all mine/i }));
    await userEvent.click(screen.getByRole('button', { name: /save merged/i }));
    expect(onResolve).toHaveBeenCalledWith({ openai: 'mine', stripe: 'mine' });
  });

  it('"Keep all theirs" flips every conflict back', async () => {
    const { onResolve } = setup();
    await userEvent.click(screen.getByRole('button', { name: /keep all mine/i }));
    await userEvent.click(screen.getByRole('button', { name: /keep all theirs/i }));
    await userEvent.click(screen.getByRole('button', { name: /save merged/i }));
    expect(onResolve).toHaveBeenCalledWith({ openai: 'theirs', stripe: 'theirs' });
  });

  it('per-key radio selection wins over bulk default', async () => {
    const { onResolve } = setup();
    // Pick "This device" for openai; leave stripe at default (theirs).
    await userEvent.click(
      screen.getByLabelText(/this device for openai/i),
    );
    await userEvent.click(screen.getByRole('button', { name: /save merged/i }));
    expect(onResolve).toHaveBeenCalledWith({ openai: 'mine', stripe: 'theirs' });
  });

  it('Cancel triggers onCancel and not onResolve', async () => {
    const { onCancel, onResolve } = setup();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onResolve).not.toHaveBeenCalled();
  });
});
