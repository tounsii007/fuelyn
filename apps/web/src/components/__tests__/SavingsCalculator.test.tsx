// @vitest-environment jsdom

// ============================================================
// SavingsCalculator — compares the nearest open priced station
// against the cheapest in range, nets out the cost of the detour,
// and renders a verdict. Returns null with fewer than two
// recommendations or when there is nothing to save. The German
// copy is hardcoded (no translation mock); the real Zustand store
// drives fuelType / vehicle / selectedStationId.
// ============================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { StationRecommendation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

import { SavingsCalculator } from '../intelligence/SavingsCalculator';

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

describe('SavingsCalculator', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({
      filter: { ...s.filter, fuelType: 'e10' },
      vehicle: null,
      selectedStationId: null,
    }));
  });
  afterEach(() => cleanup());

  it('renders nothing with fewer than two recommendations', () => {
    const { container } = render(
      <SavingsCalculator recommendations={[rec({ id: 'a', prices: prices({ e10: 1.8 }) })]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no cheaper alternative exists', () => {
    const recs = [
      rec({ id: 'a', dist: 1, prices: prices({ e10: 1.6 }) }),
      rec({ id: 'b', dist: 2, prices: prices({ e10: 1.6 }) }),
    ];
    const { container } = render(<SavingsCalculator recommendations={recs} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows gross savings for the default 45 L fill when a cheaper station exists', () => {
    const recs = [
      rec({ id: 'a', dist: 1, prices: prices({ e10: 1.8 }) }),
      rec({ id: 'b', dist: 2, prices: prices({ e10: 1.6 }) }),
    ];
    render(<SavingsCalculator recommendations={recs} />);
    expect(screen.getByText('Spar-Rechner')).toBeInTheDocument();
    expect(screen.getByText('Netto-Ersparnis')).toBeInTheDocument();
    // gross = (1.80 − 1.60) × 45 L = 9.00 €
    expect(screen.getByText(/^9\.00/)).toBeInTheDocument();
  });

  it('recomputes gross savings when the fill-volume slider changes', () => {
    const recs = [
      rec({ id: 'a', dist: 1, prices: prices({ e10: 1.8 }) }),
      rec({ id: 'b', dist: 2, prices: prices({ e10: 1.6 }) }),
    ];
    render(<SavingsCalculator recommendations={recs} />);
    fireEvent.change(screen.getByRole('slider'), { target: { value: '80' } });
    // gross = (1.80 − 1.60) × 80 L = 16.00 €
    expect(screen.getByText(/^16\.00/)).toBeInTheDocument();
  });
});
