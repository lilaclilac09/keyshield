import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VaultList } from './VaultList';
import { LocalVault } from '../../lib/vault';

function setup(initial = LocalVault.emptyVault()) {
  const onUpsertKey = vi.fn(async () => {});
  const onRemoveKey = vi.fn(async () => {});
  const onTouchKey = vi.fn(async () => {});
  const onLock = vi.fn();
  render(
    <VaultList
      vault={initial}
      onUpsertKey={onUpsertKey}
      onRemoveKey={onRemoveKey}
      onTouchKey={onTouchKey}
      onLock={onLock}
    />,
  );
  return { onUpsertKey, onRemoveKey, onTouchKey, onLock };
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
    await userEvent.type(screen.getByLabelText(/key name/i), 'stripe');
    await userEvent.type(screen.getByLabelText(/key value/i), 'sk_live_x');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onUpsertKey).toHaveBeenCalledWith('stripe', 'sk_live_x', undefined);
  });

  it('Add key form forwards parsed tags when filled in', async () => {
    const { onUpsertKey } = setup();
    await userEvent.click(screen.getByRole('button', { name: /\+ add key/i }));
    await userEvent.type(screen.getByLabelText(/key name/i), 'openai-prod');
    await userEvent.type(screen.getByLabelText(/key value/i), 'sk-x');
    await userEvent.type(screen.getByLabelText(/^tags$/i), '  prod , ai  ,, ');
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }));
    expect(onUpsertKey).toHaveBeenCalledWith('openai-prod', 'sk-x', ['prod', 'ai']);
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

  it('reveal also fires onTouchKey to bump lastUsedAt', async () => {
    const v = LocalVault.emptyVault();
    v.apiKeys['openai'] = { value: 'sk-x', createdAt: 1 };
    const { onTouchKey } = setup(v);
    await userEvent.click(screen.getByRole('button', { name: /^reveal$/i }));
    // touchKey is fire-and-forget; we just need to see it was called.
    expect(onTouchKey).toHaveBeenCalledWith('openai');
  });
});

describe('VaultList — search + tag filter', () => {
  function vaultWith(...rows: Array<[string, string, string[]?]>) {
    const v = LocalVault.emptyVault();
    let i = 0;
    for (const [name, value, tags] of rows) {
      v.apiKeys[name] = {
        value,
        createdAt: ++i,
        ...(tags ? { tags } : {}),
      };
    }
    return v;
  }

  it('filters by name (case-insensitive contains)', async () => {
    const v = vaultWith(
      ['openai-prod', 'sk-1'],
      ['stripe-test', 'sk-2'],
      ['anthropic', 'sk-3'],
    );
    setup(v);
    await userEvent.type(screen.getByLabelText(/search keys/i), 'STRIPE');
    expect(screen.getByText('stripe-test')).toBeInTheDocument();
    expect(screen.queryByText('openai-prod')).toBeNull();
    expect(screen.queryByText('anthropic')).toBeNull();
  });

  it('filters by tag substring', async () => {
    const v = vaultWith(
      ['openai-prod', 'sk-1', ['ai', 'prod']],
      ['stripe-test', 'sk-2', ['payments']],
    );
    setup(v);
    await userEvent.type(screen.getByLabelText(/search keys/i), 'pay');
    expect(screen.getByText('stripe-test')).toBeInTheDocument();
    expect(screen.queryByText('openai-prod')).toBeNull();
  });

  it('shows tag pills and clicking one filters by that tag', async () => {
    const v = vaultWith(
      ['openai-prod', 'sk-1', ['ai', 'prod']],
      ['stripe-test', 'sk-2', ['payments']],
    );
    setup(v);
    await userEvent.click(screen.getByRole('button', { name: '#payments' }));
    expect(screen.getByText('stripe-test')).toBeInTheDocument();
    expect(screen.queryByText('openai-prod')).toBeNull();
    expect(screen.getByText('1 of 2 shown')).toBeInTheDocument();
  });

  it('clicking the active tag pill again clears the filter', async () => {
    const v = vaultWith(['k1', 'sk-1', ['t1']], ['k2', 'sk-2', ['t2']]);
    setup(v);
    const pill = screen.getByRole('button', { name: '#t1' });
    await userEvent.click(pill);
    expect(pill).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(pill);
    expect(pill).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('k1')).toBeInTheDocument();
    expect(screen.getByText('k2')).toBeInTheDocument();
  });

  it('shows no-matches state when filtering produces an empty list', async () => {
    const v = vaultWith(['openai', 'sk-1']);
    setup(v);
    await userEvent.type(screen.getByLabelText(/search keys/i), 'nope');
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });
});

describe('VaultList — last-used time', () => {
  it('shows "never used" when lastUsedAt is missing', () => {
    const v = LocalVault.emptyVault();
    v.apiKeys['k'] = { value: 'sk', createdAt: 1 };
    setup(v);
    expect(screen.getByText(/never used/i)).toBeInTheDocument();
  });

  it('shows relative time when lastUsedAt is set', () => {
    const v = LocalVault.emptyVault();
    v.apiKeys['k'] = {
      value: 'sk',
      createdAt: 1,
      // 2 hours ago.
      lastUsedAt: Date.now() - 2 * 60 * 60 * 1000,
    };
    setup(v);
    expect(screen.getByText(/2h ago/)).toBeInTheDocument();
  });
});
