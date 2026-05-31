// @vitest-environment jsdom

// ============================================================
// CounterfactualCard — "was wäre wenn" savings scenarios. Self-
// suppresses (renders nothing) until the store's fuelLog holds at
// least three fills AND at least one scenario would save > €1.
// A short log of expensive diesel fills surfaces the positive
// switch-to-hybrid / switch-to-ev scenarios as a labelled card.
// Identity translations; real store + real core engine.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { FuelLogEntry } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { CounterfactualCard } from '../intelligence/CounterfactualCard';

const fill = (date: string, price = 2.0, liters = 40): FuelLogEntry => ({
  id: `f-${date}`,
  date,
  stationName: 'Test',
  stationBrand: 'Test',
  fuelType: 'diesel',
  liters,
  pricePerLiter: price,
  totalCost: price * liters,
});

describe('CounterfactualCard', () => {
  beforeEach(() => {
    useAppStore.setState({ fuelLog: [], priceHistory: [] });
  });
  afterEach(() => cleanup());

  it('renders nothing without enough fills to evaluate', () => {
    const { container } = render(<CounterfactualCard />);
    expect(container.firstChild).toBeNull();
  });

  it('surfaces positive scenarios once three expensive fills are logged', () => {
    useAppStore.setState({
      fuelLog: [
        fill('2026-05-11T12:00:00Z'),
        fill('2026-05-12T12:00:00Z'),
        fill('2026-05-13T12:00:00Z'),
      ],
    });
    render(<CounterfactualCard />);
    expect(screen.getByRole('article', { name: 'counterfactual.title' })).toBeInTheDocument();
  });
});
