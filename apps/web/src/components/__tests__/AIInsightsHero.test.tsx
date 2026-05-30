// @vitest-environment jsdom

// ============================================================
// AIInsightsHero — glass hero condensing the AI/heuristic verdict.
// The async AI advisor (TanStack Query) is mocked to "no data", so
// the component falls back to the local heuristic and reports the
// "Heuristik" power source. Copy is hardcoded German (no translation
// mock); the real store supplies fuelType + an empty price history.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { StationRecommendation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-ai-advisor', () => ({
  useAIAdvisor: () => ({ data: undefined, isLoading: false }),
}));

import { AIInsightsHero } from '../intelligence/AIInsightsHero';

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
  brand: 'Shell',
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

describe('AIInsightsHero', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({ filter: { ...s.filter, fuelType: 'e10' }, priceHistory: [] }));
  });
  afterEach(() => cleanup());

  it('renders nothing without recommendations', () => {
    const { container } = render(<AIInsightsHero recommendations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the heuristic verdict hero when recommendations exist', () => {
    render(<AIInsightsHero recommendations={[rec({ id: 'a', brand: 'Shell', prices: prices({ e10: 1.7 }) })]} />);
    expect(screen.getByRole('region', { name: 'AI Tank-Empfehlung' })).toBeInTheDocument();
    expect(screen.getByText('AI Empfehlung')).toBeInTheDocument();
    // No AI payload ⇒ the local heuristic source is shown.
    expect(screen.getByText('Heuristik · 8 Signale')).toBeInTheDocument();
  });

  it('exposes a confidence label', () => {
    render(<AIInsightsHero recommendations={[rec({ id: 'a', prices: prices({ e10: 1.7 }) })]} />);
    expect(screen.getByLabelText(/Konfidenz:/)).toBeInTheDocument();
  });
});
