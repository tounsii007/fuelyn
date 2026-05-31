// @vitest-environment jsdom

// ============================================================
// PriceHistoryChart — per-station SVG mini-chart sourced from the
// store's priceHistory, scoped to the active fuel type. Needs ≥2
// matching snapshots; the trend chip is the last-minus-previous
// delta. Snapshots for other fuel types / stations are filtered
// out. Hardcoded German; real store.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

import { PriceHistoryChart } from '../stations/PriceHistoryChart';

type Snap = { stationId: string; fuelType: 'diesel' | 'e5' | 'e10'; price: number; timestamp: string };

const snap = (over: Partial<Snap> = {}): Snap => ({
  stationId: 'st1',
  fuelType: 'e10',
  price: 1.7,
  timestamp: '2026-05-01T08:00:00.000Z',
  ...over,
});

describe('PriceHistoryChart', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({ priceHistory: [], filter: { ...s.filter, fuelType: 'e10' } }));
  });
  afterEach(() => cleanup());

  it('renders nothing without at least two snapshots', () => {
    const { container } = render(<PriceHistoryChart stationId="st1" />);
    expect(container.firstChild).toBeNull();
  });

  it('draws the chart and the rising trend delta from two snapshots', () => {
    useAppStore.setState({
      priceHistory: [
        snap({ price: 1.7, timestamp: '2026-05-01T08:00:00.000Z' }),
        snap({ price: 1.75, timestamp: '2026-05-01T09:00:00.000Z' }),
      ],
    });
    render(<PriceHistoryChart stationId="st1" />);
    expect(screen.getByRole('heading', { name: /Preisverlauf/ })).toBeInTheDocument();
    expect(screen.getByText(/0\.050/)).toBeInTheDocument();
  });

  it('ignores snapshots recorded for a different fuel type', () => {
    useAppStore.setState({
      priceHistory: [
        snap({ fuelType: 'diesel', price: 1.6, timestamp: '2026-05-01T08:00:00.000Z' }),
        snap({ fuelType: 'diesel', price: 1.62, timestamp: '2026-05-01T09:00:00.000Z' }),
      ],
    });
    const { container } = render(<PriceHistoryChart stationId="st1" />);
    expect(container.firstChild).toBeNull();
  });
});
