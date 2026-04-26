import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecoveryPhraseScreen } from './RecoveryPhraseScreen';
import { generateMnemonic } from '../../lib/mnemonic';

// Generate a real 24-word phrase for the test so we don't have to
// hand-count words (and accidentally write 23).
const PHRASE = generateMnemonic();

describe('RecoveryPhraseScreen', () => {
  it('renders all 24 words numbered', () => {
    render(
      <RecoveryPhraseScreen mnemonic={PHRASE} onAcknowledge={() => {}} />,
    );
    const words = PHRASE.split(' ');
    expect(words).toHaveLength(24);
    // The first and last words show up — and there are 24 numbered
    // <li> entries in the list.
    expect(screen.getByText(words[0])).toBeInTheDocument();
    expect(screen.getByText(words[23])).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBe(24);
  });

  it('reveal/hide button toggles the word display', async () => {
    render(
      <RecoveryPhraseScreen mnemonic={PHRASE} onAcknowledge={() => {}} />,
    );
    const firstWord = PHRASE.split(' ')[0];
    // Default: revealed.
    expect(screen.getByText(firstWord)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^hide$/i }));
    // After hide, dots are shown instead.
    expect(screen.queryByText(firstWord)).toBeNull();
    expect(screen.getAllByText('••••••').length).toBe(24);
  });

  it('the Continue button is disabled until the user types the confirmation', async () => {
    const onAck = vi.fn();
    render(
      <RecoveryPhraseScreen mnemonic={PHRASE} onAcknowledge={onAck} />,
    );
    const cont = screen.getByRole('button', { name: /continue to vault/i });
    expect(cont).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/confirmation text/i), 'wrong');
    expect(cont).toBeDisabled();

    await userEvent.clear(screen.getByLabelText(/confirmation text/i));
    await userEvent.type(
      screen.getByLabelText(/confirmation text/i),
      'I have saved my phrase',
    );
    expect(cont).toBeEnabled();

    await userEvent.click(cont);
    expect(onAck).toHaveBeenCalledOnce();
  });
});
