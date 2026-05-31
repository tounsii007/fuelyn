// @vitest-environment jsdom

// ============================================================
// ConsumptionTracker — log fill-ups against the store's fuelLog.
// Always renders (no hydration gate): an empty log shows the
// title + empty-state CTA; opening the form, filling station +
// liters + price and saving appends a real entry via the store;
// each history row exposes a remove control. Identity
// translations; real store.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { FuelLogEntry } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

vi.mock('@/lib/hooks/use-translations', () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: 'de' }),
}));

import { ConsumptionTracker } from '../intelligence/ConsumptionTracker';

const entry = (over: Partial<FuelLogEntry> = {}): FuelLogEntry => ({
  id: 'f1',
  date: '2026-05-15T10:00:00.000Z',
  stationName: 'Shell Bahnhof',
  stationBrand: 'Shell',
  fuelType: 'e10',
  liters: 42,
  pricePerLiter: 1.699,
  totalCost: 71.36,
  ...over,
});

describe('ConsumptionTracker', () => {
  beforeEach(() => {
    useAppStore.setState({ fuelLog: [] });
  });
  afterEach(() => cleanup());

  it('shows the title and empty-state CTA with no entries', () => {
    render(<ConsumptionTracker />);
    expect(screen.getByRole('heading', { name: 'consumptionTracker.title' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'consumptionTracker.addEntryCta' })).toBeInTheDocument();
    expect(screen.getByText('consumptionTracker.emptyTitle')).toBeInTheDocument();
  });

  it('persists a filled-in entry to the store on save', () => {
    render(<ConsumptionTracker />);
    fireEvent.click(screen.getByRole('button', { name: 'consumptionTracker.addEntryCta' }));
    fireEvent.change(screen.getByPlaceholderText('consumptionTracker.formStationPlaceholder'), {
      target: { value: 'Esso Ring' },
    });
    fireEvent.change(screen.getByPlaceholderText('45.0'), { target: { value: '40' } });
    fireEvent.change(screen.getByPlaceholderText('1.659'), { target: { value: '1.789' } });
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));

    const log = useAppStore.getState().fuelLog;
    expect(log).toHaveLength(1);
    expect(log[0]?.stationName).toBe('Esso Ring');
    expect(log[0]?.liters).toBe(40);
    expect(log[0]?.pricePerLiter).toBe(1.789);
  });

  it('removes a logged entry when its delete control is pressed', () => {
    useAppStore.setState({ fuelLog: [entry()] });
    render(<ConsumptionTracker />);
    expect(screen.getByText('Shell Bahnhof')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'consumptionTracker.removeEntryAria' }));
    expect(useAppStore.getState().fuelLog).toHaveLength(0);
  });
});
