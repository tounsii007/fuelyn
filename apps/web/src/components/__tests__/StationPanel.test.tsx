// @vitest-environment jsdom

// ============================================================
// StationPanel — the slide-up detail sheet for the station the
// user tapped (store.routeTarget). Renders nothing until a route
// target is set; otherwise shows the brand header, a close button
// (clearRoute), per-fuel price tiles, external Google / Apple
// Maps deep links, and an action rail whose favorite + compare
// icon buttons write straight through to the real store (their
// aria-labels flip as membership changes). The in-app
// "Navigation starten" CTA stays disabled until a route loads.
// Real store; real ui primitives + core formatters; identity
// translations. We never click Share (navigator.share).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { Station } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { StationPanel } from '../stations/StationPanel';

function makeStation(over: Partial<Station> = {}): Station {
  return {
    id: 's1',
    name: 'Aral Test',
    brand: 'Aral',
    street: 'Teststraße',
    houseNumber: '1',
    postCode: '35037',
    place: 'Marburg',
    lat: 50.8,
    lng: 8.77,
    dist: 1.0,
    prices: { diesel: null, e5: null, e10: 1.799 },
    isOpen: true,
    ...over,
  };
}

describe('StationPanel', () => {
  beforeEach(() => {
    useAppStore.setState((s) => ({
      routeTarget: makeStation(),
      activeRoute: null,
      routeLoading: false,
      filter: { ...s.filter, fuelType: 'e10' },
      vehicle: null,
      favorites: [],
      compareStationIds: [],
    }));
  });
  afterEach(() => cleanup());

  it('renders nothing when no station is targeted', () => {
    useAppStore.setState({ routeTarget: null });
    const { container } = render(<StationPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the targeted station with maps links and an inert nav CTA', () => {
    render(<StationPanel />);
    expect(screen.getByRole('heading', { name: 'Aral' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'common.close' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Google Maps' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Apple Maps' })).toBeInTheDocument();
    // No active route yet → the in-app navigation CTA is disabled.
    expect(screen.getByRole('button', { name: 'Navigation starten' })).toBeDisabled();
  });

  it('toggles favorite membership in the store and flips the label', () => {
    render(<StationPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'station.addFavorite' }));
    expect(useAppStore.getState().isFavorite('s1')).toBe(true);
    expect(screen.getByRole('button', { name: 'station.removeFavorite' })).toBeInTheDocument();
  });

  it('adds the station to the compare tray and flips the label', () => {
    render(<StationPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'compare.addedHint' }));
    expect(useAppStore.getState().compareStationIds).toContain('s1');
    expect(screen.getByRole('button', { name: 'compare.removeHint' })).toBeInTheDocument();
  });

  it('clears the route from the close button, dismissing the panel', () => {
    const { container } = render(<StationPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
    expect(useAppStore.getState().routeTarget).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});
