// @vitest-environment jsdom

// ============================================================
// BestDealCard — premium hero tile for the cheapest open station.
// Returns null with no priced recommendations; otherwise renders a
// labelled article with the winning station, a "below average"
// savings badge, and (≥3 priced stations) a live price-index bar.
// next/link is stubbed; identity translations; real store fuelType.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { StationRecommendation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
}));
vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { BestDealCard } from '../intelligence/BestDealCard';

type Station = StationRecommendation['station'];

const prices = (over: Partial<Station['prices']> = {}): Station['prices'] => ({
  diesel: null,
  e5: null,
  e10: null,
  ...over,
});

const station = (over: Partial<Station> = {}): Station => ({
  id: 'st',
  name: 'Tankstelle',
  brand: 'Aral',
  street: 'Hauptstr.',
  houseNumber: '1',
  postCode: '60311',
  place: 'Frankfurt',
  lat: 50,
  lng: 8,
  dist: 1,
  prices: prices(),
  isOpen: true,
  ...over,
});

const rec = (over: Partial<Station>): StationRecommendation => ({
  station: station(over),
  scores: { price: 0.5, distance: 0.5, reachability: 1, openStatus: 1, favorite: 0, overall: 0.5 },
  reachabilityStatus: 'safe',
  estimatedFuelCost: 0,
  estimatedDriveTime: 0,
  rank: 1,
  isBestOption: false,
  reasons: [],
});

describe('BestDealCard', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({ filter: { ...s.filter, fuelType: 'e10' }, vehicle: null }));
  });
  afterEach(() => cleanup());

  it('renders nothing without any priced recommendations', () => {
    const { container } = render(<BestDealCard recommendations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the winning station in a labelled article', () => {
    render(<BestDealCard recommendations={[rec({ id: 'a', brand: 'Aral', dist: 1.2, prices: prices({ e10: 1.749 }) })]} />);
    expect(screen.getByRole('article', { name: 'station.bestOption' })).toBeInTheDocument();
    expect(screen.getByText('bestDeal.eyebrow')).toBeInTheDocument();
    expect(screen.getByText('Aral')).toBeInTheDocument();
  });

  it('shows a savings badge and the price-index bar with ≥3 priced stations', () => {
    const recs = [
      rec({ id: 'a', dist: 3, prices: prices({ e10: 2.0 }) }),
      rec({ id: 'b', dist: 2, prices: prices({ e10: 1.8 }) }),
      rec({ id: 'c', dist: 1, prices: prices({ e10: 1.6 }) }),
    ];
    render(<BestDealCard recommendations={recs} />);
    // savingsCt = (avg 1.8 − min 1.6) × 100 ⇒ "below average" badge
    expect(screen.getByText(/panel\.belowAvg/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /bestDeal\.indexLabel/ })).toBeInTheDocument();
  });
});
