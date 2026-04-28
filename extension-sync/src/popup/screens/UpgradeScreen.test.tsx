import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpgradeScreen } from './UpgradeScreen';

describe('UpgradeScreen', () => {
  it('renders the upgrade message and retry button', () => {
    render(<UpgradeScreen onRetry={() => {}} />);
    expect(screen.getByText(/browser not supported/i)).toBeInTheDocument();
    expect(screen.getByText(/Safari 17\+/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('mentions PRF (in the headline message and the footnote)', () => {
    render(<UpgradeScreen onRetry={() => {}} />);
    // PRF appears in the upgrade message AND in the footer explainer.
    // Both are intentional; we just want >= 1 mention overall.
    expect(screen.getAllByText(/PRF/).length).toBeGreaterThan(0);
  });

  it('clicking Try again invokes onRetry', async () => {
    const onRetry = vi.fn();
    render(<UpgradeScreen onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
