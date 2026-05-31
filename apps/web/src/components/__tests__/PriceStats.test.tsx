// @vitest-environment jsdom

// ============================================================
// PriceStats — min/avg/max spread bar computed from the
// recommendations list + the active fuel type in the store.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { Station, StationRecommendation } from '@fuelyn/core';
import { formatPrice } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { PriceStats } from '../stations/PriceStats';

const station = (e10: number | null): Station => ({
  id: 's',
  name: 'Test',
  brand: 'Aral',
  street: 'Hauptstr.',
  houseNumber: '1',
  postCode: '60311',
  place: 'Frankfurt',
  lat: 50,
  lng: 8,
  dist: 1,
  prices: { diesel: null, e5: null, e10 },
  isOpen: true,
});

const recAt = (e10: number | null): StationRecommendation => ({
  station: station(e10),
  scores: { price: 0.5, distance: 0.5, reachability: 1, openStatus: 1, favorite: 0, overall: 0.6 },
  reachabilityStatus: 'safe',
  estimatedFuelCost: 0,
  estimatedDriveTime: 0,
  rank: 1,
  isBestOption: false,
  reasons: [],
});

describe('PriceStats', () => {
  beforeEach(() => {
    useAppStore.setState({
      filter: { fuelType: 'e10', radiusKm: 5, onlyOpen: false, brands: [], priceMin: null, priceMax: null },
      routeTarget: null,
    });
  });
  afterEach(() => cleanup());

  it('renders nothing when no station has a price for the active fuel', () => {
    const { container } = render(<PriceStats recommendations={[recAt(null), recAt(null)]} />);
    expect(container.firstChild).toBeNull();
  });

  it('summarises the cheapest and most expensive prices', () => {
    const { container } = render(
      <PriceStats recommendations={[recAt(1.7), recAt(1.75), recAt(1.8)]} />,
    );
    const section = container.querySelector('section[aria-label]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain(formatPrice(1.7)); // 1,700 — min
    expect(section?.textContent).toContain(formatPrice(1.8)); // 1,800 — max
    expect(section?.textContent).toContain('3'); // count of priced stations
  });

  it('shows a savings hint once the spread is wide enough', () => {
    const { container } = render(<PriceStats recommendations={[recAt(1.6), recAt(1.8)]} />);
    expect(container.textContent).toMatch(/Sparpotenzial/);
  });

  it('exposes the spread as a labelled distribution bar', () => {
    const { container } = render(<PriceStats recommendations={[recAt(1.6), recAt(1.8)]} />);
    expect(container.querySelector('[role="img"]')).not.toBeNull();
  });
});
