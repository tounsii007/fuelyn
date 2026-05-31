// @vitest-environment jsdom

// ============================================================
// StatCard — KPI tile (label, value, optional unit + tone).
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatCard } from '../ui/StatCard';

afterEach(() => cleanup());

describe('StatCard', () => {
  it('renders the label and value', () => {
    render(<StatCard label="Ersparnis" value="42" />);
    expect(screen.getByText('Ersparnis')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('renders a unit suffix only when provided', () => {
    const { rerender } = render(<StatCard label="l" value="1" />);
    expect(screen.queryByText('€')).toBeNull();
    rerender(<StatCard label="l" value="1" unit="€" />);
    expect(screen.getByText('€')).toBeInTheDocument();
  });

  it('accepts a ReactNode value', () => {
    render(<StatCard label="l" value={<strong data-testid="rich">9,9</strong>} />);
    expect(screen.getByTestId('rich')).toBeInTheDocument();
  });

  it('applies tone-specific value colour classes', () => {
    const cases: Array<[
      'neutral' | 'brand' | 'success' | 'warning' | 'danger',
      RegExp,
    ]> = [
      ['neutral', /text-gray-900/],
      ['brand', /text-brand-700/],
      ['success', /text-emerald-600/],
      ['warning', /text-amber-600/],
      ['danger', /text-red-600/],
    ];
    cases.forEach(([tone, re]) => {
      const { unmount } = render(<StatCard label="l" value="v" tone={tone} />);
      // The value paragraph carries the tone class.
      expect(screen.getByText('v').className).toMatch(re);
      unmount();
    });
  });

  it('forwards a custom className to the root', () => {
    const { container } = render(<StatCard label="l" value="v" className="custom-cls" />);
    expect(container.firstElementChild?.className).toMatch(/custom-cls/);
  });
});
