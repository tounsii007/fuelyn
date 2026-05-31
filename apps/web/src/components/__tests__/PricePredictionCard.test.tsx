// @vitest-environment jsdom

// ============================================================
// PricePredictionCard — 24h forecast for the active fuel, built
// from the store's priceHistory. Self-suppresses when there are
// no snapshots for the active fuel or confidence is below 5%.
// Two weeks of low-variance hourly snapshots clears the
// confidence floor and renders the card with its sparkline.
// Identity translations; real store + real core predictor.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { PricePredictionCard } from '../intelligence/PricePredictionCard';

type Snap = { stationId: string; fuelType: string; price: number; timestamp: string };

// Hourly series anchored on *now* (the card predicts against the
// real clock) with a gentle daily sine — ≥7 low-variance days
// clears the ≥0.6 confidence bar in the engine's own tests.
function syntheticSeries(fuelType: string, days: number, base = 1.7, amplitude = 0.04): Snap[] {
  const out: Snap[] = [];
  const start = Date.now() - days * 24 * 3600 * 1000;
  for (let i = 0; i < days * 24; i++) {
    const d = new Date(start + i * 3600 * 1000);
    const seasonal = amplitude * Math.sin(((d.getHours() - 12) / 24) * 2 * Math.PI);
    const jitter = ((i * 13) % 7) * 0.0005;
    out.push({
      stationId: 'st1',
      fuelType,
      price: Math.round((base + seasonal + jitter) * 1000) / 1000,
      timestamp: d.toISOString(),
    });
  }
  return out;
}

describe('PricePredictionCard', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({ priceHistory: [], filter: { ...s.filter, fuelType: 'e10' } }));
  });
  afterEach(() => cleanup());

  it('renders nothing without snapshots for the active fuel', () => {
    const { container } = render(<PricePredictionCard />);
    expect(container.firstChild).toBeNull();
  });

  it('ignores snapshots recorded for a different fuel type', () => {
    useAppStore.setState({ priceHistory: syntheticSeries('diesel', 14) });
    const { container } = render(<PricePredictionCard />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the forecast once enough confident history exists', () => {
    useAppStore.setState({ priceHistory: syntheticSeries('e10', 14) });
    render(<PricePredictionCard />);
    expect(screen.getByRole('article', { name: 'pricePrediction.title' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '24h price forecast' })).toBeInTheDocument();
  });
});
