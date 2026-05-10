import { describe, it, expect } from 'vitest';
import {
  computeCounterfactuals,
  SCENARIO_PARAMS,
} from '../counterfactual';
import type { FuelLogEntry } from '../../domain/types';

function fill(date: string, fuel: 'diesel' | 'e5' | 'e10', price = 1.85, liters = 40): FuelLogEntry {
  return {
    id: `f-${date}-${fuel}`,
    date,
    stationName: 'Test',
    stationBrand: 'Test',
    fuelType: fuel,
    liters,
    pricePerLiter: price,
    totalCost: price * liters,
  };
}

describe('computeCounterfactuals — empty', () => {
  it('returns null on empty log', () => {
    expect(computeCounterfactuals({ log: [], market: [] })).toBeNull();
  });
});

describe('computeCounterfactuals — switchToHybrid', () => {
  it('saves exactly the expected % on cost and CO₂', () => {
    const log = [fill('2026-05-13T12:00:00Z', 'diesel', 2.0, 40)];
    const r = computeCounterfactuals({ log, market: [] });
    const hybrid = r!.scenarios.find((s) => s.id === 'switch-to-hybrid')!;
    const expectedFactor = SCENARIO_PARAMS.hybrid.consumptionFactor;
    expect(hybrid.hypotheticalCostEur).toBeCloseTo(80 * expectedFactor, 1);
    expect(hybrid.deltaEur).toBeCloseTo(80 * (1 - expectedFactor), 1);
    expect(hybrid.deltaCo2Kg).toBeCloseTo(40 * 2.65 * (1 - expectedFactor), 0);
  });
});

describe('computeCounterfactuals — switchToEv', () => {
  it('produces a positive delta when fuel is expensive', () => {
    const log = [fill('2026-05-13T12:00:00Z', 'diesel', 2.0, 40)];
    const r = computeCounterfactuals({ log, market: [] });
    const ev = r!.scenarios.find((s) => s.id === 'switch-to-ev')!;
    // 40L diesel × 16.66 km/L = 666 km. 666/100 × 18 = 120 kWh.
    // Cost: 120 × 0.45 = 54 €. Actual: 80 €. Savings: 26 €.
    expect(ev.hypotheticalCostEur).toBeCloseTo(54, 0);
    expect(ev.deltaEur).toBeCloseTo(26, 0);
    // CO₂: 120 × 0.38 = 45.6 kg. Actual: 106 kg. Savings: ~60 kg.
    expect(ev.deltaCo2Kg).toBeCloseTo(60, 0);
  });
});

describe('computeCounterfactuals — switchToDiesel', () => {
  it('leaves a diesel-only log unchanged', () => {
    const log = [fill('2026-05-13T12:00:00Z', 'diesel', 2.0, 40)];
    const r = computeCounterfactuals({ log, market: [] });
    const d = r!.scenarios.find((s) => s.id === 'switch-to-diesel')!;
    expect(d.deltaEur).toBe(0);
    expect(d.deltaCo2Kg).toBe(0);
  });

  it('saves money for an E5-heavy user via cheaper diesel + lower consumption', () => {
    const log = [fill('2026-05-13T12:00:00Z', 'e5', 2.0, 40)];
    const r = computeCounterfactuals({ log, market: [] });
    const d = r!.scenarios.find((s) => s.id === 'switch-to-diesel')!;
    expect(d.deltaEur).toBeGreaterThan(0);
  });
});

describe('computeCounterfactuals — fillAtBestStation', () => {
  it('uses the cheapest market price within ±3 days', () => {
    const log = [fill('2026-05-13T12:00:00Z', 'e5', 2.0, 40)];
    const market = [
      { timestamp: '2026-05-12T10:00:00Z', price: 1.6, fuelType: 'e5' as const },
      { timestamp: '2026-05-13T12:00:00Z', price: 1.9, fuelType: 'e5' as const },
      { timestamp: '2026-05-14T08:00:00Z', price: 1.5, fuelType: 'e5' as const },
    ];
    const r = computeCounterfactuals({ log, market });
    const best = r!.scenarios.find((s) => s.id === 'fill-at-best-station')!;
    // Cheapest within ±3 days = 1.50 → 40L × 1.50 = 60 €
    expect(best.hypotheticalCostEur).toBe(60);
    expect(best.deltaEur).toBe(20);
  });

  it('falls back to actual price when no market in window', () => {
    const log = [fill('2026-05-13T12:00:00Z', 'e5', 2.0, 40)];
    const market = [
      { timestamp: '2025-01-01T10:00:00Z', price: 1.0, fuelType: 'e5' as const },
    ];
    const r = computeCounterfactuals({ log, market });
    const best = r!.scenarios.find((s) => s.id === 'fill-at-best-station')!;
    expect(best.deltaEur).toBe(0);
  });
});

describe('computeCounterfactuals — fillBefore8am', () => {
  it('uses 5-7am avg market when available', () => {
    const log = [fill('2026-05-13T18:00:00Z', 'e5', 2.0, 40)];
    const market = [
      { timestamp: '2026-05-11T05:00:00Z', price: 1.6, fuelType: 'e5' as const },
      { timestamp: '2026-05-11T06:00:00Z', price: 1.6, fuelType: 'e5' as const },
      { timestamp: '2026-05-11T07:00:00Z', price: 1.6, fuelType: 'e5' as const },
    ];
    const r = computeCounterfactuals({ log, market });
    const early = r!.scenarios.find((s) => s.id === 'fill-before-8am')!;
    expect(early.hypotheticalCostEur).toBe(64);
    expect(early.deltaEur).toBe(16);
  });
});

describe('computeCounterfactuals — sorting + filter', () => {
  it('sorts scenarios by descending savings', () => {
    const log = [fill('2026-05-13T18:00:00Z', 'e5', 2.0, 40)];
    const r = computeCounterfactuals({ log, market: [] })!;
    for (let i = 1; i < r.scenarios.length; i++) {
      expect(r.scenarios[i - 1]!.deltaEur).toBeGreaterThanOrEqual(r.scenarios[i]!.deltaEur);
    }
  });

  it('filter prop limits which scenarios run', () => {
    const log = [fill('2026-05-13T18:00:00Z', 'e5', 2.0, 40)];
    const r = computeCounterfactuals({
      log,
      market: [],
      scenarios: ['switch-to-hybrid', 'switch-to-ev'],
    })!;
    expect(r.scenarios).toHaveLength(2);
    const ids = r.scenarios.map((s) => s.id).sort();
    expect(ids).toEqual(['switch-to-ev', 'switch-to-hybrid']);
  });
});
