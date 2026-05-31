// @vitest-environment jsdom

// ============================================================
// SavingTipsCard — personalized savings suggestions. Suppresses
// itself when the engine yields no tips (e.g. fewer than five
// fills). Twelve evening diesel fills against a market that is
// cheap in the early morning surfaces the "switch-hour" tip, so
// the labelled tips card renders. Identity translations; real
// store + real core tips engine.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { FuelLogEntry } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { SavingTipsCard } from '../intelligence/SavingTipsCard';

type Snap = { stationId: string; fuelType: string; price: number; timestamp: string };

const fill = (date: string, station: string, price = 1.85, liters = 40): FuelLogEntry => ({
  id: `f-${date}`,
  date,
  stationName: station,
  stationBrand: 'Aral',
  fuelType: 'diesel',
  liters,
  pricePerLiter: price,
  totalCost: price * liters,
});

// Cheap early mornings (5-7h: 1.70), pricey evenings (17-19h:
// 1.85), flat otherwise — the shape that makes evening fills look
// improvable and triggers the switch-hour tip.
function patternedMarket(days: number, until: string): Snap[] {
  const out: Snap[] = [];
  const end = Date.parse(until);
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      const ts = end - d * 24 * 3600 * 1000 + h * 3600 * 1000;
      const isCheapHour = h >= 5 && h <= 7;
      const isPriceyHour = h >= 17 && h <= 19;
      const price = isCheapHour ? 1.7 : isPriceyHour ? 1.85 : 1.78;
      out.push({ stationId: 'st1', fuelType: 'diesel', price, timestamp: new Date(ts).toISOString() });
    }
  }
  return out;
}

describe('SavingTipsCard', () => {
  beforeEach(() => {
    useAppStore.setState({ fuelLog: [], priceHistory: [] });
  });
  afterEach(() => cleanup());

  it('renders nothing when the engine produces no tips', () => {
    const { container } = render(<SavingTipsCard />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the tips card when an actionable pattern is detected', () => {
    useAppStore.setState({
      fuelLog: Array.from({ length: 12 }, (_, i) =>
        fill(`2026-05-${String(i + 1).padStart(2, '0')}T18:00:00Z`, `S${i}`),
      ),
      priceHistory: patternedMarket(14, '2026-05-13T00:00:00Z'),
    });
    render(<SavingTipsCard />);
    expect(screen.getByRole('article', { name: 'savingTips.title' })).toBeInTheDocument();
  });
});
