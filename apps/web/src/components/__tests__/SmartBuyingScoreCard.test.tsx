// @vitest-environment jsdom

// ============================================================
// SmartBuyingScoreCard — 0–100 buying-skill KPI. Suppresses
// itself while the engine has zero evaluable fills (a fill counts
// only when the market has context within ±14 days). A handful of
// diesel fills against a dense diesel market renders the score
// card (heading + band + the three component bars). Identity
// translations; real store + real core score engine.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { FuelLogEntry } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { SmartBuyingScoreCard } from '../intelligence/SmartBuyingScoreCard';

type Snap = { stationId: string; fuelType: string; price: number; timestamp: string };

const fill = (date: string, price: number, liters = 40): FuelLogEntry => ({
  id: `f-${date}-${price}`,
  date,
  stationName: 'Test',
  stationBrand: 'Test',
  fuelType: 'diesel',
  liters,
  pricePerLiter: price,
  totalCost: price * liters,
});

// Dense daily diesel market at `basePrice` (±jitter) for `days`
// ending at `until` — gives every nearby fill its ±14d context.
function uniformMarket(until: string, days: number, basePrice: number, jitter = 0.02): Snap[] {
  const out: Snap[] = [];
  const end = Date.parse(until);
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h += 6) {
      const ts = end - d * 24 * 3600 * 1000 + h * 3600 * 1000;
      const i = d * 4 + h / 6;
      const offset = ((i % 7) - 3) * (jitter / 3);
      out.push({
        stationId: 'st1',
        fuelType: 'diesel',
        price: Math.round((basePrice + offset) * 1000) / 1000,
        timestamp: new Date(ts).toISOString(),
      });
    }
  }
  return out;
}

describe('SmartBuyingScoreCard', () => {
  beforeEach(() => {
    useAppStore.setState({ fuelLog: [], priceHistory: [] });
  });
  afterEach(() => cleanup());

  it('renders nothing when no fill has market context', () => {
    useAppStore.setState({ fuelLog: [fill('2026-05-13T12:00:00Z', 1.74)], priceHistory: [] });
    const { container } = render(<SmartBuyingScoreCard />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the score card once fills can be evaluated against the market', () => {
    useAppStore.setState({
      fuelLog: [
        fill('2026-05-13T12:00:00Z', 1.74),
        fill('2026-05-08T12:00:00Z', 1.74),
        fill('2026-05-03T12:00:00Z', 1.74),
        fill('2026-04-28T12:00:00Z', 1.74),
        fill('2026-04-23T12:00:00Z', 1.74),
      ],
      priceHistory: uniformMarket('2026-05-13T00:00:00Z', 30, 1.8),
    });
    render(<SmartBuyingScoreCard />);
    expect(screen.getByRole('article', { name: 'smartBuying.title' })).toBeInTheDocument();
  });
});
