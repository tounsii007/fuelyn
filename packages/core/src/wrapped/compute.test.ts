import { describe, expect, it } from 'vitest';
import { computeWrapped, DEFAULT_WRAPPED_CONFIG } from './compute';
import type { FuelLogEntry } from '../domain/types';

function entry(overrides: Partial<FuelLogEntry> & { date: string }): FuelLogEntry {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    date: overrides.date,
    stationName: overrides.stationName ?? 'Aral Mitte',
    stationBrand: overrides.stationBrand ?? 'Aral',
    fuelType: overrides.fuelType ?? 'e10',
    liters: overrides.liters ?? 40,
    pricePerLiter: overrides.pricePerLiter ?? 1.799,
    totalCost:
      overrides.totalCost ??
      (overrides.liters ?? 40) * (overrides.pricePerLiter ?? 1.799),
    odometer: overrides.odometer,
    note: overrides.note,
  };
}

describe('computeWrapped', () => {
  it('returns hasMinimumData=false below the threshold', () => {
    const out = computeWrapped({
      entries: [entry({ date: '2025-03-01T08:00:00Z' })],
      year: 2025,
    });
    expect(out.hasMinimumData).toBe(false);
    expect(out.totals.entries).toBe(0);
  });

  it('aggregates totals correctly', () => {
    const out = computeWrapped({
      entries: [
        entry({ date: '2025-01-01T00:00:00Z', liters: 40, pricePerLiter: 1.7, fuelType: 'e10' }),
        entry({ date: '2025-02-01T00:00:00Z', liters: 30, pricePerLiter: 1.8, fuelType: 'e10' }),
        entry({ date: '2025-03-01T00:00:00Z', liters: 50, pricePerLiter: 1.6, fuelType: 'diesel' }),
      ],
      year: 2025,
    });
    expect(out.hasMinimumData).toBe(true);
    expect(out.totals.entries).toBe(3);
    expect(out.totals.liters).toBe(120);
    expect(out.totals.eur).toBe(40 * 1.7 + 30 * 1.8 + 50 * 1.6);
    // CO₂: 40*2.21 + 30*2.21 + 50*2.65
    expect(out.totals.co2Kg).toBeGreaterThan(0);
  });

  it('filters entries to the target year', () => {
    const out = computeWrapped({
      entries: [
        entry({ date: '2024-12-31T23:00:00Z' }),
        entry({ date: '2025-01-01T00:00:00Z' }),
        entry({ date: '2025-06-15T00:00:00Z' }),
        entry({ date: '2025-09-15T00:00:00Z' }),
        entry({ date: '2026-01-02T00:00:00Z' }),
      ],
      year: 2025,
    });
    expect(out.totals.entries).toBe(3);
  });

  it('picks cheapest and most expensive correctly', () => {
    const out = computeWrapped({
      entries: [
        entry({ date: '2025-01-15T00:00:00Z', pricePerLiter: 1.6, stationBrand: 'JET' }),
        entry({ date: '2025-02-15T00:00:00Z', pricePerLiter: 1.9, stationBrand: 'Shell' }),
        entry({ date: '2025-03-15T00:00:00Z', pricePerLiter: 1.75, stationBrand: 'Aral' }),
      ],
      year: 2025,
    });
    expect(out.highlights.cheapest?.entry.stationBrand).toBe('JET');
    expect(out.highlights.mostExpensive?.entry.stationBrand).toBe('Shell');
  });

  it('counts top brand by visits', () => {
    const out = computeWrapped({
      entries: [
        entry({ date: '2025-01-01T00:00:00Z', stationBrand: 'Aral' }),
        entry({ date: '2025-02-01T00:00:00Z', stationBrand: 'Shell' }),
        entry({ date: '2025-03-01T00:00:00Z', stationBrand: 'Aral' }),
        entry({ date: '2025-04-01T00:00:00Z', stationBrand: 'Aral' }),
        entry({ date: '2025-05-01T00:00:00Z', stationBrand: 'JET' }),
      ],
      year: 2025,
    });
    expect(out.topBrand?.brand).toBe('Aral');
    expect(out.topBrand?.visits).toBe(3);
  });

  it('computes distance from odometer deltas', () => {
    const out = computeWrapped({
      entries: [
        entry({ date: '2025-01-01T00:00:00Z', odometer: 10_000, liters: 40 }),
        entry({ date: '2025-06-01T00:00:00Z', odometer: 15_000, liters: 35 }),
        entry({ date: '2025-12-01T00:00:00Z', odometer: 22_000, liters: 45 }),
      ],
      year: 2025,
    });
    expect(out.distance.km).toBe(12_000);
    // 120L / 12_000km * 100 = 1.0L/100km — silly but math holds
    expect(out.distance.avgConsumptionLPer100Km).toBeCloseTo(1.0, 1);
  });

  it('skips distance when odometer absent', () => {
    const out = computeWrapped({
      entries: [
        entry({ date: '2025-01-01T00:00:00Z' }),
        entry({ date: '2025-02-01T00:00:00Z' }),
        entry({ date: '2025-03-01T00:00:00Z' }),
      ],
      year: 2025,
    });
    expect(out.distance.km).toBe(0);
    expect(out.distance.avgConsumptionLPer100Km).toBeNull();
  });

  it('day-of-week pattern is sorted by avg price ascending', () => {
    // Mondays 1.60, Fridays 1.90
    const out = computeWrapped({
      entries: [
        entry({ date: '2025-01-06T00:00:00Z', pricePerLiter: 1.6 }), // Mo
        entry({ date: '2025-01-13T00:00:00Z', pricePerLiter: 1.6 }), // Mo
        entry({ date: '2025-01-10T00:00:00Z', pricePerLiter: 1.9 }), // Fr
        entry({ date: '2025-01-17T00:00:00Z', pricePerLiter: 1.9 }), // Fr
      ],
      year: 2025,
    });
    expect(out.dayOfWeekPattern[0]?.label).toBe('Montag');
    expect(out.dayOfWeekPattern[out.dayOfWeekPattern.length - 1]?.label).toBe('Freitag');
  });

  it('savingsVsAverage: positive when user paid more than market', () => {
    const out = computeWrapped({
      entries: [
        entry({ date: '2025-01-01T00:00:00Z', pricePerLiter: 1.95, liters: 40 }),
        entry({ date: '2025-02-01T00:00:00Z', pricePerLiter: 1.95, liters: 40 }),
        entry({ date: '2025-03-01T00:00:00Z', pricePerLiter: 1.95, liters: 40 }),
      ],
      priceHistory: [
        { stationId: 's', fuelType: 'e10', price: 1.7, timestamp: '2025-01-01T00:00:00Z' },
        { stationId: 's', fuelType: 'e10', price: 1.7, timestamp: '2025-02-01T00:00:00Z' },
      ],
      year: 2025,
    });
    expect(out.savingsVsAverage.diffEur).toBeGreaterThan(0);
  });

  it('savingsVsAverage: negative when user beat the market', () => {
    const out = computeWrapped({
      entries: [
        entry({ date: '2025-01-01T00:00:00Z', pricePerLiter: 1.5, liters: 40 }),
        entry({ date: '2025-02-01T00:00:00Z', pricePerLiter: 1.5, liters: 40 }),
        entry({ date: '2025-03-01T00:00:00Z', pricePerLiter: 1.5, liters: 40 }),
      ],
      priceHistory: [
        { stationId: 's', fuelType: 'e10', price: 1.8, timestamp: '2025-01-01T00:00:00Z' },
        { stationId: 's', fuelType: 'e10', price: 1.8, timestamp: '2025-02-01T00:00:00Z' },
      ],
      year: 2025,
    });
    expect(out.savingsVsAverage.diffEur).toBeLessThan(0);
  });

  it('streaks: longestGapDays computed across sorted entries', () => {
    const out = computeWrapped({
      entries: [
        entry({ date: '2025-01-01T00:00:00Z' }),
        entry({ date: '2025-01-10T00:00:00Z' }), // 9 day gap
        entry({ date: '2025-04-01T00:00:00Z' }), // ~80 day gap
      ],
      year: 2025,
    });
    expect(out.streaks.longestGapDays).toBeGreaterThanOrEqual(80);
  });

  it('respects DEFAULT_WRAPPED_CONFIG for CO₂', () => {
    expect(DEFAULT_WRAPPED_CONFIG.co2PerLiter.diesel).toBeGreaterThan(
      DEFAULT_WRAPPED_CONFIG.co2PerLiter.e10,
    );
  });
});
