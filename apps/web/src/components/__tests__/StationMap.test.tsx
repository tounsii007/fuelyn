// @vitest-environment jsdom

// ============================================================
// StationMap — the premium Leaflet map. Leaflet itself is never
// loaded: react-leaflet is mocked (MapContainer renders its children;
// Marker exposes its click handler + popup; the layer primitives are
// inert; useMap yields a method stub) and `leaflet` is stubbed for the
// module-load icon-default workaround + divIcon. The map's own chrome
// and wiring are the subject — the zoom / locate / heatmap / style
// controls, the style picker writing settings.mapStyle, the heatmap
// toggle, the locate button falling back to onRequestLocation when no
// fix is known, and a station marker firing onStationClick. The child
// RouteLayer / HeatmapLayer ride the same react-leaflet mock. Filter +
// settings come from the real store.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { StationRecommendation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

const { mapStub } = vi.hoisted(() => ({
  mapStub: {
    setView: () => {},
    flyTo: () => {},
    zoomIn: () => {},
    zoomOut: () => {},
    fitBounds: () => {},
    getZoom: () => 13,
    getCenter: () => ({ lat: 50.8, lng: 8.77 }),
    getBounds: () => ({
      getNorthEast: () => ({ lat: 51, lng: 9 }),
      getSouthWest: () => ({ lat: 50, lng: 8 }),
    }),
  },
}));

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Marker: ({
    children,
    eventHandlers,
  }: {
    children?: React.ReactNode;
    eventHandlers?: { click?: () => void };
  }) => (
    <div data-testid="marker" onClick={eventHandlers?.click}>
      {children}
    </div>
  ),
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  useMap: () => mapStub,
  useMapEvents: () => undefined,
  Polyline: () => null,
  CircleMarker: () => null,
}));
vi.mock('leaflet', () => ({
  default: {
    divIcon: () => ({}),
    Icon: { Default: { prototype: {}, mergeOptions: () => {} } },
  },
}));

import { StationMap } from '../map/StationMap';

function makeRec(id: string): StationRecommendation {
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
      dist: 1,
      prices: { diesel: 1.5, e5: null, e10: 1.7 },
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

describe('StationMap', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({
      filter: { ...s.filter, fuelType: 'e10' },
      userLocation: null,
      activeRoute: null,
      selectedStationId: null,
      settings: { ...s.settings, mapStyle: 'standard' },
    }));
  });
  afterEach(() => cleanup());

  it('renders the map chrome controls', () => {
    render(<StationMap recommendations={[]} onStationClick={() => {}} />);
    expect(screen.getByRole('button', { name: 'Vergrößern' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verkleinern' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Standort ermitteln' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Heatmap an' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kartenstil' })).toBeInTheDocument();
  });

  it('writes the chosen map style through the store', () => {
    render(<StationMap recommendations={[]} onStationClick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kartenstil' }));
    fireEvent.click(screen.getByRole('button', { name: /Premium/ }));
    expect(useAppStore.getState().settings.mapStyle).toBe('premium');
  });

  it('toggles the heatmap overlay control', () => {
    render(<StationMap recommendations={[]} onStationClick={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Heatmap an' }));
    expect(screen.getByRole('button', { name: 'Heatmap aus' })).toBeInTheDocument();
  });

  it('falls back to onRequestLocation when no fix is known', () => {
    const onRequestLocation = vi.fn();
    render(
      <StationMap
        recommendations={[]}
        onStationClick={() => {}}
        onRequestLocation={onRequestLocation}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Standort ermitteln' }));
    expect(onRequestLocation).toHaveBeenCalledTimes(1);
  });

  it('fires onStationClick when a station marker is clicked', () => {
    const onStationClick = vi.fn();
    render(<StationMap recommendations={[makeRec('s1')]} onStationClick={onStationClick} />);
    fireEvent.click(screen.getByTestId('marker'));
    expect(onStationClick).toHaveBeenCalledWith('s1');
  });
});
