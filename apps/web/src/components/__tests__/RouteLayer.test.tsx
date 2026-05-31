// @vitest-environment jsdom

// ============================================================
// RouteLayer — draws the active driving route as three stacked
// Polylines and fits the map to the route bounds. We don't load
// Leaflet: react-leaflet is mocked so `useMap()` yields a stub with
// a spy `fitBounds`, and `Polyline` renders a marker div we can
// count. The component's real logic is the subject — the
// coordinate mapping, the `positions.length < 2` guard (renders
// null + skips fitBounds), and the fit-to-bounds side-effect with
// the mapped coordinates. Route data comes from the real store.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { RouteData } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

const { mapStub, fitBoundsMock } = vi.hoisted(() => {
  const fitBoundsMock = vi.fn();
  return { mapStub: { fitBounds: fitBoundsMock }, fitBoundsMock };
});

vi.mock('react-leaflet', () => ({
  useMap: () => mapStub,
  Polyline: () => <div data-testid="polyline" />,
}));

import { RouteLayer } from '../map/RouteLayer';

function makeRoute(coordinates: [number, number][]): RouteData {
  return { coordinates, distanceMeters: 1000, durationSeconds: 600, steps: [] };
}

describe('RouteLayer', () => {
  beforeEach(() => {
    fitBoundsMock.mockClear();
    useAppStore.setState({ activeRoute: null });
  });
  afterEach(() => cleanup());

  it('renders nothing and never fits bounds without a route', () => {
    const { container } = render(<RouteLayer />);
    expect(container.firstChild).toBeNull();
    expect(fitBoundsMock).not.toHaveBeenCalled();
  });

  it('draws the stacked polylines and fits the map to the mapped coordinates', () => {
    useAppStore.setState({
      activeRoute: makeRoute([
        [50.8, 8.7],
        [50.9, 8.8],
      ]),
    });
    render(<RouteLayer />);
    expect(screen.getAllByTestId('polyline')).toHaveLength(3);
    expect(fitBoundsMock).toHaveBeenCalledTimes(1);
    expect(fitBoundsMock.mock.calls[0]![0]).toEqual([
      [50.8, 8.7],
      [50.9, 8.8],
    ]);
  });
});
