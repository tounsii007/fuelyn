// @vitest-environment jsdom

// ============================================================
// PriceTrendChart — pure SVG 7/30-day price trend (no store, no
// translations). With external data it slices to the active
// period window, so we feed timestamps in the last few hours to
// keep them inside both windows. Renders nothing below 2 points;
// the period toggle re-labels the chart's accessible name.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { PriceDataPoint } from '@/lib/utils/mock-price-history';

import { PriceTrendChart } from '../charts/PriceTrendChart';

const pt = (price: number, hoursAgo: number): PriceDataPoint => ({
  timestamp: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
  price,
});

describe('PriceTrendChart', () => {
  afterEach(() => cleanup());

  it('renders nothing with fewer than two points', () => {
    const { container } = render(<PriceTrendChart data={[pt(1.7, 0)]} />);
    expect(container.firstChild).toBeNull();
  });

  it('draws the labelled trend chart with a period toggle', () => {
    render(<PriceTrendChart data={[pt(1.7, 48), pt(1.8, 24), pt(1.75, 0)]} />);
    expect(screen.getByRole('img', { name: /Preisverlauf.*letzte 7 Tage/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preisverlauf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7T' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30T' })).toBeInTheDocument();
  });

  it('relabels the chart window when the 30-day toggle is picked', () => {
    render(<PriceTrendChart data={[pt(1.7, 48), pt(1.8, 24), pt(1.75, 0)]} />);
    fireEvent.click(screen.getByRole('button', { name: '30T' }));
    expect(screen.getByRole('img', { name: /letzte 30 Tage/ })).toBeInTheDocument();
  });
});
