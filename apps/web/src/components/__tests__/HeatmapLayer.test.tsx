// @vitest-environment jsdom

// ============================================================
// HeatmapLayer — translucent price-tier overlay (one CircleMarker
// per priced station, tinted by its price tercile). Leaflet is not
// loaded: react-leaflet is mocked so `useMap()` yields a fixed zoom,
// `useMapEvents` is inert, and `CircleMarker` renders a div exposing
// its fill colour. The component's own logic is the subject — it
// reads prices for the active fuel from the real store filter, skips
// stations with no price for that fuel (→ renders null), and buckets
// three-plus prices into low/mid/high terciles (emerald / amber /
// rose). Identity-free: only the store fuelType matters.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { StationRecommendation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

const { mapStub } = vi.hoisted(() => ({ mapStub: { getZoom: () => 13 } }));

vi.mock('react-leaflet', () => ({
  useMap: () => mapStub,
  useMapEvents: () => undefined,
  CircleMarker: ({ pathOptions }: { pathOptions: { fillColor: string } }) => (
    <div data-testid="heat" data-color={pathOptions.fillColor} />
  ),
}));

import { HeatmapLayer } from '../map/HeatmapLayer';

// Only id / lat / lng / prices[fuel] are read; the rest satisfies the type.
function makeRec(id: string, e10: number | null): StationRecommendation {
  return {
    station: {
      id,
      name: `Station ${id}`,
      brand: 'Aral',
      street: 'Teststraße',
      houseNumber: '1',
      postCode: '35037',
      place: 'Marburg',
      lat: 50.8,
      lng: 8.77,
      dist: 1.0,
      prices: { diesel: 1.5, e5: null, e10 },
      isOpen: true,
    },
    scores: { overall: 0.9, price: 0.9, distance: 0.9, reachability: 1, openStatus: 1, favorite: 0 },
    reachabilityStatus: 'safe',
    estimatedFuelCost: 0.1,
    estimatedDriveTime: 2,
    rank: 1,
    isBestOption: false,
    reasons: [],
  };
}

describe('HeatmapLayer', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({ filter: { ...s.filter, fuelType: 'e10' } }));
  });
  afterEach(() => cleanup());

  it('renders nothing when given no recommendations', () => {
    const { container } = render(<HeatmapLayer recommendations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('skips stations that have no price for the active fuel', () => {
    // Priced on diesel only; the active fuel is e10 → nothing to paint.
    const { container } = render(
      <HeatmapLayer recommendations={[makeRec('a', null), makeRec('b', null)]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('paints one tinted marker per station bucketed into price terciles', () => {
    render(
      <HeatmapLayer
        recommendations={[makeRec('cheap', 1.5), makeRec('mid', 1.7), makeRec('dear', 1.9)]}
      />,
    );
    const colors = screen.getAllByTestId('heat').map((el) => el.getAttribute('data-color'));
    expect(colors).toHaveLength(3);
    expect(colors).toContain('#10B981'); // emerald — cheapest tercile
    expect(colors).toContain('#F59E0B'); // amber — middle
    expect(colors).toContain('#F43F5E'); // rose — dearest tercile
  });
});
