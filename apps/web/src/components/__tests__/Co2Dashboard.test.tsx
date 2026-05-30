// @vitest-environment jsdom

// ============================================================
// Co2Dashboard — monthly CO₂ trend card sourced from the store's
// fuelLog via summarizeCo2 (core). Renders nothing until hydrated
// AND there is at least one month of data; otherwise a labelled
// region with the monthly bar chart (role=img), three KPIs and a
// per-fuel breakdown. Identity translations; real store + core.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { FuelLogEntry } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { Co2Dashboard } from '../fuelLog/Co2Dashboard';

const entry = (over: Partial<FuelLogEntry> = {}): FuelLogEntry => ({
  id: 'f1',
  date: '2026-05-15T10:00:00.000Z',
  stationName: 'Aral Hauptstr.',
  stationBrand: 'Aral',
  fuelType: 'e10',
  liters: 45,
  pricePerLiter: 1.7,
  totalCost: 76.5,
  ...over,
});

describe('Co2Dashboard', () => {
  beforeEach(() => {
    useAppStore.setState({ fuelLog: [] });
  });
  afterEach(() => cleanup());

  it('renders nothing without any fuel-log history', () => {
    const { container } = render(<Co2Dashboard />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the labelled region with the monthly chart and KPIs', () => {
    useAppStore.setState({ fuelLog: [entry()] });
    render(<Co2Dashboard />);
    expect(screen.getByRole('region', { name: 'co2Dashboard.title' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'co2Dashboard.title' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'co2Dashboard.monthlyChart' })).toBeInTheDocument();
    expect(screen.getByText('co2Dashboard.kpiLifetime')).toBeInTheDocument();
  });

  it('surfaces the per-fuel breakdown for the logged fuel type', () => {
    useAppStore.setState({ fuelLog: [entry({ fuelType: 'e10' })] });
    render(<Co2Dashboard />);
    expect(screen.getByText('co2Dashboard.perFuelTitle')).toBeInTheDocument();
    expect(screen.getByText(/E10 ·/)).toBeInTheDocument();
  });
});
