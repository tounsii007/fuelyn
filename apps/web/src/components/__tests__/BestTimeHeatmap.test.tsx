// @vitest-environment jsdom

// ============================================================
// BestTimeHeatmap — weekday×hour average-price grid fed by the
// store's priceHistory (filtered to the active fuel). Unlike the
// other intelligence cards it never returns null once hydrated:
// an empty/sparse history renders a titled section with an
// empty-state line, while any valid snapshot drives the populated
// grid (one aria-labelled cell per filled weekday×hour bucket)
// plus best/worst summary chips. Identity translations; real
// store + real core heatmap builder.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { BestTimeHeatmap } from '../stats/BestTimeHeatmap';

type Snap = { stationId: string; fuelType: string; price: number; timestamp: string };

const snap = (fuelType: string, price: number, timestamp: string): Snap => ({
  stationId: 'st1',
  fuelType,
  price,
  timestamp,
});

describe('BestTimeHeatmap', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({ priceHistory: [], filter: { ...s.filter, fuelType: 'e10' } }));
  });
  afterEach(() => cleanup());

  it('renders a titled empty-state section when there is no history', () => {
    render(<BestTimeHeatmap />);
    expect(screen.getByRole('region', { name: 'bestTimeHeatmap.title' })).toBeInTheDocument();
    expect(screen.getByText('bestTimeHeatmap.empty')).toBeInTheDocument();
  });

  it('renders the populated grid with one labelled cell per filled bucket', () => {
    // Three snapshots on the same Wednesday at distinct hours →
    // three (dow=2, hour) cells, each with a count-bearing label.
    useAppStore.setState({
      priceHistory: [
        snap('e10', 1.7, '2026-05-13T06:00:00Z'),
        snap('e10', 1.8, '2026-05-13T12:00:00Z'),
        snap('e10', 1.9, '2026-05-13T18:00:00Z'),
      ],
    });
    render(<BestTimeHeatmap />);
    expect(screen.getByText('bestTimeHeatmap.subtitle')).toBeInTheDocument();
    expect(screen.queryByText('bestTimeHeatmap.empty')).toBeNull();
    expect(screen.getAllByLabelText(/EUR\/L based on \d+ samples/)).toHaveLength(3);
  });

  it('ignores snapshots recorded for a different fuel type', () => {
    useAppStore.setState({ priceHistory: [snap('diesel', 1.6, '2026-05-13T06:00:00Z')] });
    render(<BestTimeHeatmap />);
    expect(screen.getByText('bestTimeHeatmap.empty')).toBeInTheDocument();
  });
});
