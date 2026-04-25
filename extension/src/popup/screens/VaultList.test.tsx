import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VaultList } from './VaultList';
import { LocalVault } from '../../lib/vault';

function setup(initial = LocalVault.emptyVault()) {
  const onUpsertKey = vi.fn(async () => {});
  const onRemoveKey = vi.fn(async () => {});
  const onLock = vi.fn();
  render(
    <VaultList
      vault={initial}
      onUpsertKey={onUpsertKey}
      onRemoveKey={onRemoveKey}
      onLock={onLock}
    />,
  );
  return { onUpsertKey, onRemoveKey, onLock };
}

describe('VaultList', () => {
  it('renders the empty state when no keys are stored', () => {
    setup();
    expect(screen.getByText(/no keys yet/i)).toBeInTheDocument();
  });

  it('renders one row per stored key, masked by default', () => {
    const v = LocalVault.emptyVault();
    v.apiKeys['openai'] = { value: 'sk-secret-value', createdAt: 1 };
    v.apiKeys['anthropic'] = { value: 'sk-ant-something-else', createdAt: 2 };
    setup(v);
    expect(screen.getByText('openai')).toBeInTheDocument();
    expect(screen.getByText('anthropic')).toBeInTheDocument();
    // Plaintext should NOT appear before the user clicks "reveal".
    expect(screen.queryByText(/sk-secret-value/)).toBeNull();
    expect(screen.queryByText(/sk-ant-something-else/)).toBeNull();
  });

  it('reveal/hide toggles plaintext for a single key', async () => {
    const v = LocalVault.emptyVault();
    v.apiKeys['openai'] = { value: 'sk-shown', createdAt: 1 };
    setup(v);
    await userEvent.click(screen.getByRole('button', { name: /^reveal$/i }));
    expect(screen.getByText(/sk-shown/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^hide$/i }));
    expect(screen.queryByText(/sk-shown/)).toBeNull();
  });

  it('Add key form upserts via the callback', async () => {
    const { onUpsertKey } = setup();
    await userEvent.click(screen.getByRole('button', { name: /\+ add key/i }));
    await userEvent.type(screen.getByPlaceholderText(/name/i), 'stripe');
    await userEvent.type(screen.getByPlaceholderText(/value/i), 'sk_live_x');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onUpsertKey).toHaveBeenCalledWith('stripe', 'sk_live_x');
  });

  it('Add key form ignores blank submissions', async () => {
    const { onUpsertKey } = setup();
    await userEvent.click(screen.getByRole('button', { name: /\+ add key/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onUpsertKey).not.toHaveBeenCalled();
  });

  it('Delete button fires onRemoveKey for the right entry', async () => {
    const v = LocalVault.emptyVault();
    v.apiKeys['stripe'] = { value: 'sk_live_x', createdAt: 1 };
    const { onRemoveKey } = setup(v);
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onRemoveKey).toHaveBeenCalledWith('stripe');
  });

  it('Lock button fires onLock', async () => {
    const { onLock } = setup();
    await userEvent.click(screen.getByRole('button', { name: /^lock$/i }));
    expect(onLock).toHaveBeenCalledOnce();
  });
});
