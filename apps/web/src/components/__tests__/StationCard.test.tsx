// @vitest-environment jsdom

// ============================================================
// StationCard — rich, memoised station row used in the list and
// detail views. The whole card is a role="button" that fires the
// id-aware onStationClick; nested icon buttons toggle favorite /
// compare membership (writing through to the real store) and open
// the price-report dialog. The 24h history hook is mocked to an
// empty result so the card renders without a QueryClientProvider
// (the sparkline degrades to a dashed baseline). Real store; real
// ui primitives + core formatters.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { StationRecommendation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

// Avoid TanStack Query entirely: the lazy 24h-history hook just
// returns "no data", so the sparkline shows its placeholder.
vi.mock('@/lib/hooks/use-station-history', () => ({
  useStationHistory: () => ({ data: undefined }),
}));

import { StationCard } from '../stations/StationCard';

function makeRecommendation(
  over: { id?: string; brand?: string; price?: number } = {},
): StationRecommendation {
  const id = over.id ?? 's1';
  const brand = over.brand ?? 'Aral';
  const price = over.price ?? 1.799;
  return {
    station: {
      id,
      name: `${brand} Test`,
      brand,
      street: 'Teststraße',
      houseNumber: '1',
      postCode: '35037',
      place: 'Marburg',
      lat: 50.8,
      lng: 8.77,
      dist: 1.0,
      prices: { diesel: null, e5: null, e10: price },
      isOpen: true,
    },
    scores: {
      overall: 0.9,
      price: 0.9,
      distance: 0.9,
      reachability: 1.0,
      openStatus: 1,
      favorite: 0,
    },
    reachabilityStatus: 'safe',
    estimatedFuelCost: 0.1,
    estimatedDriveTime: 2,
    rank: 1,
    isBestOption: false,
    reasons: [],
  };
}

describe('StationCard', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({
      filter: { ...s.filter, fuelType: 'e10' },
      favorites: [],
      compareStationIds: [],
      activeRoute: null,
      vehicle: null,
    }));
  });
  afterEach(() => cleanup());

  it('invokes onStationClick with the station id when the card is activated', () => {
    const onStationClick = vi.fn();
    const { container } = render(
      <StationCard
        recommendation={makeRecommendation({ id: 's7' })}
        onStationClick={onStationClick}
      />,
    );
    const card = container.firstElementChild as HTMLElement;
    expect(card).toHaveAttribute('role', 'button');
    fireEvent.click(card);
    expect(onStationClick).toHaveBeenCalledWith('s7');
  });

  it('toggles favorite state in the store when the heart is clicked', () => {
    render(<StationCard recommendation={makeRecommendation()} onStationClick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Als Favorit speichern' }));
    expect(useAppStore.getState().isFavorite('s1')).toBe(true);
    // Label flips once the store marks it a favorite.
    expect(screen.getByRole('button', { name: 'Favorit entfernen' })).toBeInTheDocument();
  });

  it('adds the station to the compare set when the compare button is clicked', () => {
    render(<StationCard recommendation={makeRecommendation()} onStationClick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Zum Vergleich hinzufügen' }));
    expect(useAppStore.getState().compareStationIds).toContain('s1');
    expect(screen.getByRole('button', { name: 'Aus Vergleich entfernen' })).toBeInTheDocument();
  });

  it('opens the price-report dialog from the "Preis melden" button', () => {
    render(<StationCard recommendation={makeRecommendation()} onStationClick={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Preis melden' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preis melden' })).toBeInTheDocument();
  });
});
