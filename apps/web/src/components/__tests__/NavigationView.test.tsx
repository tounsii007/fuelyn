// @vitest-environment jsdom

// ============================================================
// NavigationView — full-screen turn-by-turn overlay. Leaflet is
// never loaded: react-leaflet is mocked (MapContainer renders its
// children; TileLayer / Polyline / Marker are inert; useMap yields a
// stub) and `leaflet`'s divIcon is stubbed, so the component's own
// logic is the subject — the not-navigating / empty-steps null
// guards, the current-maneuver header + next-step preview, the stop
// control (stopNavigation + clearRoute), and the collapsible step
// list. `navigator.geolocation` is stubbed so the GPS-watch effect is
// inert; a single-coordinate route keeps the simulated-GPS interval
// from arming. Route + nav state come from the real store.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { Station, RouteData, RouteStep, ManeuverType } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TileLayer: () => null,
  Polyline: () => null,
  Marker: () => null,
  useMap: () => ({ setView: () => {} }),
}));
vi.mock('leaflet', () => ({ default: { divIcon: () => ({}) } }));

import { NavigationView } from '../navigation/NavigationView';

function makeStep(instruction: string, type: ManeuverType = 'turn-right'): RouteStep {
  return {
    distance: 500,
    duration: 60,
    name: 'Teststraße',
    maneuver: { type, location: { lat: 50.8, lng: 8.77 }, bearingAfter: 90 },
    geometry: [[50.8, 8.77]],
    instruction,
  };
}

// One coordinate satisfies the firstCoordinate guard while keeping
// useSimulatedGPS inert (it requires ≥2 coordinates to arm).
function makeRoute(steps: RouteStep[]): RouteData {
  return { coordinates: [[50.8, 8.77]], distanceMeters: 1000, durationSeconds: 600, steps };
}

function makeStation(): Station {
  return {
    id: 's1',
    name: 'Zieltankstelle',
    brand: 'Aral',
    street: 'Zielstraße',
    houseNumber: '5',
    postCode: '35037',
    place: 'Marburg',
    lat: 50.81,
    lng: 8.78,
    dist: 2,
    prices: { diesel: 1.5, e5: null, e10: 1.7 },
    isOpen: true,
  };
}

function startNav(steps: RouteStep[]): void {
  useAppStore.setState({
    activeRoute: makeRoute(steps),
    routeTarget: makeStation(),
    isNavigating: true,
    currentStepIndex: 0,
    navPosition: null,
    navHeading: 0,
    remainingDistance: 1000,
    remainingDuration: 600,
  });
}

describe('NavigationView', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn() },
    });
    useAppStore.setState({
      activeRoute: null,
      routeTarget: null,
      isNavigating: false,
      currentStepIndex: 0,
      navPosition: null,
      navHeading: 0,
      remainingDistance: 0,
      remainingDuration: 0,
    });
  });
  afterEach(() => cleanup());

  it('renders nothing while not navigating', () => {
    const { container } = render(<NavigationView />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the active route has no steps', () => {
    startNav([]);
    const { container } = render(<NavigationView />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the current maneuver, the next-step preview and the stop control', () => {
    startNav([makeStep('Links abbiegen', 'turn-left'), makeStep('Rechts abbiegen', 'turn-right')]);
    render(<NavigationView />);
    expect(screen.getByText('Links abbiegen')).toBeInTheDocument();
    expect(screen.getByText(/Danach:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Navigation beenden' })).toBeInTheDocument();
  });

  it('stops navigation and clears the route from the stop control', () => {
    startNav([makeStep('Geradeaus', 'continue')]);
    render(<NavigationView />);
    fireEvent.click(screen.getByRole('button', { name: 'Navigation beenden' }));
    expect(useAppStore.getState().isNavigating).toBe(false);
    expect(useAppStore.getState().activeRoute).toBeNull();
  });

  it('expands the step list on demand', () => {
    startNav([makeStep('Erster Schritt'), makeStep('Zweiter Schritt')]);
    render(<NavigationView />);
    fireEvent.click(screen.getByRole('button', { name: 'Alle Schritte anzeigen (2)' }));
    expect(screen.getByRole('button', { name: 'Schritte ausblenden' })).toBeInTheDocument();
  });
});
