// @vitest-environment jsdom

// ============================================================
// TripCostCard — trip cost estimate gated on hydration + a
// configured vehicle, computed from the store + core.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';
import type { VehicleProfile } from '@fuelyn/core';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { TripCostCard } from '../trip/TripCostCard';

const VEHICLE: VehicleProfile = {
  id: 'v1',
  name: 'Testwagen',
  fuelType: 'e10',
  driveType: 'benzin',
  consumption: 7,
  tankCapacity: 50,
  batteryCapacity: null,
  currentRange: null,
  currentFuelLevel: null,
  currentFuelUnit: 'percentage',
};
const START = { lat: 50.0, lng: 8.0 };
const END = { lat: 50.5, lng: 8.6 };

describe('TripCostCard', () => {
  beforeEach(() => {
    useAppStore.setState({ vehicle: null, priceHistory: [] });
  });
  afterEach(() => cleanup());

  it('renders nothing without both endpoints', () => {
    const { container } = render(<TripCostCard start={START} end={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('prompts to add a vehicle when none is configured', () => {
    render(<TripCostCard start={START} end={END} />);
    expect(screen.getByText('tripCost.needsVehicle')).toBeInTheDocument();
  });

  it('renders the cost estimate when a vehicle is set', () => {
    useAppStore.setState({ vehicle: VEHICLE });
    const { container } = render(<TripCostCard start={START} end={END} />);
    const card = container.querySelector('article[aria-label="tripCost.title"]');
    expect(card).not.toBeNull();
    // Distance / liters / CO₂ stat strip suffixes.
    expect(card?.textContent).toMatch(/km/);
    expect(card?.textContent).toMatch(/L/);
    expect(card?.textContent).toMatch(/kg/);
  });
});
