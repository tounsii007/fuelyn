// @vitest-environment jsdom

// ============================================================
// ChargingPlannerCard — EV charging-session planner. Hydration-
// gated; with no active vehicle it falls back to 75 kWh / 18 kWh
// per 100 km defaults, so the KPIs are deterministic:
//   energy = (80−20)/100 × 75 = 45.0 kWh; cost = 45 × 0.55 = 24.75 €.
// Pure engine, identity translations, real store.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { ChargingPlannerCard } from '../charging/ChargingPlannerCard';

describe('ChargingPlannerCard', () => {
  beforeEach(() => {
    useAppStore.setState({ vehicle: null });
  });
  afterEach(() => cleanup());

  it('renders the planner with default-derived KPIs and charger presets', () => {
    render(<ChargingPlannerCard />);
    expect(screen.getByRole('region', { name: 'chargingPlanner.title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '50 kW · DC' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '300 kW · DC' })).toBeInTheDocument();
    expect(screen.getByText('45.0 kWh')).toBeInTheDocument();
    expect(screen.getByText('24.75 €')).toBeInTheDocument();
  });

  it('recomputes the cost when the tariff changes', () => {
    render(<ChargingPlannerCard />);
    fireEvent.change(screen.getByLabelText(/chargingPlanner\.tariff/), { target: { value: '1' } });
    // cost = 45 kWh × 1.00 €/kWh = 45.00 €
    expect(screen.getByText('45.00 €')).toBeInTheDocument();
  });

  it('recomputes the energy when the target SoC changes', () => {
    render(<ChargingPlannerCard />);
    fireEvent.change(screen.getByLabelText(/chargingPlanner\.toPct/), { target: { value: '100' } });
    // energy = (100−20)/100 × 75 = 60.0 kWh
    expect(screen.getByText('60.0 kWh')).toBeInTheDocument();
  });
});
