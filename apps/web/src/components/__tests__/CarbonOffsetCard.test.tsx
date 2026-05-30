// @vitest-environment jsdom

// ============================================================
// CarbonOffsetCard — turns the user's logged CO₂ footprint into
// offset picks. Suppressed with an empty fuel log. Free users see
// the "unlock" CTA + premium hint; premium users (carbon-offset-buy)
// see the "purchase" CTA. Hydration-gated; identity translations;
// real store fuelLog + subscription drive the live CO₂ math.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { FuelLogEntry } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { CarbonOffsetCard } from '../co2/CarbonOffsetCard';

const entry = (over: Partial<FuelLogEntry> = {}): FuelLogEntry => ({
  id: 'e1',
  date: '2026-01-15T00:00:00.000Z',
  stationName: 'Aral Hauptstr.',
  stationBrand: 'Aral',
  fuelType: 'diesel',
  liters: 40,
  pricePerLiter: 1.6,
  totalCost: 64,
  ...over,
});

const premiumSub = {
  status: 'active' as const,
  plan: 'annual' as const,
  currentPeriodEnd: new Date(Date.now() + 30 * 864e5).toISOString(),
};

describe('CarbonOffsetCard', () => {
  beforeEach(() => {
    useAppStore.setState({ fuelLog: [], subscription: { status: 'free', plan: null } });
  });
  afterEach(() => cleanup());

  it('renders nothing with an empty fuel log', () => {
    const { container } = render(<CarbonOffsetCard />);
    expect(container.firstChild).toBeNull();
  });

  it('offers offset picks with an unlock CTA to free users', () => {
    useAppStore.setState({ fuelLog: [entry()], subscription: { status: 'free', plan: null } });
    render(<CarbonOffsetCard />);
    expect(screen.getByRole('region', { name: 'offset.title' })).toBeInTheDocument();
    expect(screen.getByText('offset.cheapestLabel')).toBeInTheDocument();
    expect(screen.getByText('offset.permanenceLabel')).toBeInTheDocument();
    expect(screen.getByText('offset.premiumHint')).toBeInTheDocument();
    expect(screen.getAllByText('offset.unlockCta').length).toBeGreaterThan(0);
    expect(screen.queryByText('offset.purchaseCta')).toBeNull();
  });

  it('shows the purchase CTA and hides the premium hint for premium users', () => {
    useAppStore.setState({ fuelLog: [entry()], subscription: premiumSub });
    render(<CarbonOffsetCard />);
    expect(screen.getAllByText('offset.purchaseCta').length).toBeGreaterThan(0);
    expect(screen.queryByText('offset.unlockCta')).toBeNull();
    expect(screen.queryByText('offset.premiumHint')).toBeNull();
  });
});
