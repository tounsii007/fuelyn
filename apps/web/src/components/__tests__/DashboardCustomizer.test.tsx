// @vitest-environment jsdom

// ============================================================
// DashboardCustomizer — reorder + visibility toggles for the
// homepage cards, driven entirely by the store's dashboardCards
// slice. A labelled region lists each card with up/down controls
// (ends disabled), a known label, and a visibility checkbox.
// Toggling flips `visible`; moving down swaps order. Identity
// translations; real store seeded per test.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { DashboardCustomizer } from '../settings/DashboardCustomizer';

const seed = () =>
  useAppStore.setState({
    dashboardCards: [
      { id: 'best-deal', visible: true },
      { id: 'price-prediction', visible: false },
    ],
  });

describe('DashboardCustomizer', () => {
  beforeEach(seed);
  afterEach(() => cleanup());

  it('lists each card with labels, a reset control and reflects visibility', () => {
    render(<DashboardCustomizer />);
    expect(screen.getByRole('region', { name: 'dashboardCustomizer.title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dashboardCustomizer.reset' })).toBeInTheDocument();
    expect(screen.getByText('Top Deal')).toBeInTheDocument();
    expect(screen.getByText('Preis-Prognose')).toBeInTheDocument();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    // First card cannot move up.
    expect(screen.getAllByRole('button', { name: 'dashboardCustomizer.moveUp' })[0]).toBeDisabled();
  });

  it('toggles a card visibility flag through the store', () => {
    render(<DashboardCustomizer />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(useAppStore.getState().dashboardCards[0]?.visible).toBe(false);
  });

  it('moves a card down, swapping the stored order', () => {
    render(<DashboardCustomizer />);
    fireEvent.click(screen.getAllByRole('button', { name: 'dashboardCustomizer.moveDown' })[0]!);
    expect(useAppStore.getState().dashboardCards.map((c) => c.id)).toEqual([
      'price-prediction',
      'best-deal',
    ]);
  });
});
