// ============================================================
// summarizeCo2 / entryCo2Kg — CO₂ aggregation tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  summarizeCo2,
  entryCo2Kg,
  CO2_FACTOR_KG_PER_LITER,
} from '../co2-tracking';
import type { FuelLogEntry } from '../../domain/types';

const NOW = new Date('2026-05-13T12:00:00Z');

function entry(date: string, fuelType: 'diesel' | 'e5' | 'e10', liters: number, totalCost = liters * 1.8): FuelLogEntry {
  return {
    id: `e-${date}-${liters}`,
    date,
    stationName: 'Test',
    stationBrand: 'Test',
    fuelType,
    liters,
    pricePerLiter: totalCost / liters,
    totalCost,
  };
}

describe('CO2_FACTOR_KG_PER_LITER', () => {
  it('matches the documented well-to-wheel factors', () => {
    expect(CO2_FACTOR_KG_PER_LITER.diesel).toBe(2.65);
    expect(CO2_FACTOR_KG_PER_LITER.e5).toBe(2.32);
    expect(CO2_FACTOR_KG_PER_LITER.e10).toBe(2.21);
  });

  it('e10 emits less than e5 emits less than diesel (sanity check)', () => {
    // E10 has more bio-ethanol blend than E5 → lower CO₂.
    // Diesel is densest energy → highest CO₂ per liter.
    expect(CO2_FACTOR_KG_PER_LITER.e10).toBeLessThan(CO2_FACTOR_KG_PER_LITER.e5);
    expect(CO2_FACTOR_KG_PER_LITER.e5).toBeLessThan(CO2_FACTOR_KG_PER_LITER.diesel);
  });
});

describe('entryCo2Kg', () => {
  it('multiplies liters by the per-fuel factor', () => {
    expect(entryCo2Kg(entry('2026-05-13', 'diesel', 40))).toBeCloseTo(106);
    expect(entryCo2Kg(entry('2026-05-13', 'e10', 40))).toBeCloseTo(88.4);
  });

  it('returns 0 for invalid liters', () => {
    expect(entryCo2Kg({ ...entry('2026-05-13', 'diesel', 40), liters: NaN })).toBe(0);
  });
});

describe('summarizeCo2 — empty / minimal log', () => {
  it('returns zero-filled summary on empty log', () => {
    const r = summarizeCo2([], NOW);
    expect(r.monthly).toEqual([]);
    expect(r.totalCo2Kg).toBe(0);
    expect(r.totalLiters).toBe(0);
    expect(r.treeYearsEquivalent).toBe(0);
    expect(r.rolling30dKg).toBeNull();
  });

  it('rejects malformed entries (bad date, neg liters, NaN liters)', () => {
    const bad: FuelLogEntry[] = [
      { ...entry('not-a-date', 'diesel', 40) },
      { ...entry('2026-05-13', 'diesel', 0) },
      { ...entry('2026-05-13', 'diesel', -5) },
      { ...entry('2026-05-13', 'diesel', NaN) },
    ];
    expect(summarizeCo2(bad, NOW).totalLiters).toBe(0);
  });
});

describe('summarizeCo2 — bucketing', () => {
  it('groups entries by year-month and sorts newest first', () => {
    const log = [
      entry('2026-05-13T12:00:00Z', 'diesel', 40),
      entry('2026-05-02T08:00:00Z', 'e10', 30),
      entry('2026-04-20T17:00:00Z', 'diesel', 35),
      entry('2026-03-15T09:00:00Z', 'e5', 25),
    ];
    const r = summarizeCo2(log, NOW);
    expect(r.monthly).toHaveLength(3);
    // Newest-first
    expect(r.monthly[0]?.ymKey).toBe('2026-05');
    expect(r.monthly[1]?.ymKey).toBe('2026-04');
    expect(r.monthly[2]?.ymKey).toBe('2026-03');
    // 2026-05 had two entries
    expect(r.monthly[0]?.entries).toBe(2);
    expect(r.monthly[0]?.liters).toBe(70);
  });

  it('per-fuel breakdown within a month sums to month totals', () => {
    const log = [
      entry('2026-05-13', 'diesel', 40),
      entry('2026-05-15', 'e10', 30),
    ];
    const r = summarizeCo2(log, NOW);
    const m = r.monthly[0]!;
    expect(m.byFuel.diesel.liters + m.byFuel.e10.liters).toBeCloseTo(m.liters);
    expect(m.byFuel.diesel.co2Kg + m.byFuel.e10.co2Kg).toBeCloseTo(m.co2Kg);
  });
});

describe('summarizeCo2 — lifetime totals', () => {
  it('correctly accumulates total CO₂ and tree-years equivalent', () => {
    // 40 L diesel @ 2.65 = 106 kg → 106/22 ≈ 5 trees
    const log = [entry('2026-05-13', 'diesel', 40)];
    const r = summarizeCo2(log, NOW);
    expect(r.totalCo2Kg).toBeCloseTo(106);
    expect(r.treeYearsEquivalent).toBe(5);
  });

  it('per-fuel share sums to ~1 when there is data', () => {
    const log = [
      entry('2026-05-13', 'diesel', 40),
      entry('2026-05-15', 'e10', 30),
    ];
    const r = summarizeCo2(log, NOW);
    const sumShare =
      r.byFuel.diesel.share + r.byFuel.e5.share + r.byFuel.e10.share;
    // Allow tiny rounding drift (3-decimal share precision)
    expect(sumShare).toBeGreaterThan(0.999);
    expect(sumShare).toBeLessThan(1.001);
  });
});

describe('summarizeCo2 — rolling 30d', () => {
  it('returns null when history is shorter than 30 days', () => {
    // All entries within last 10 days — not enough history yet.
    const log = [
      entry('2026-05-08', 'diesel', 40),
      entry('2026-05-12', 'e10', 30),
    ];
    const r = summarizeCo2(log, NOW);
    expect(r.rolling30dKg).toBeNull();
  });

  it('reports rolling 30d once history is long enough', () => {
    // Old entry (older than 30 days) + recent entry (last 30d).
    const log = [
      entry('2026-01-01', 'diesel', 40), // > 30 days old, doesn't count toward rolling
      entry('2026-05-01', 'diesel', 50), // within last 30d, counts
      entry('2026-05-12', 'e10', 30),    // within last 30d, counts
    ];
    const r = summarizeCo2(log, NOW);
    // 50L diesel + 30L e10 = 132.5 + 66.3 = ~198.8 kg
    expect(r.rolling30dKg).not.toBeNull();
    expect(r.rolling30dKg!).toBeCloseTo(198.8, 0);
  });
});

describe('summarizeCo2 — output stability', () => {
  it('is deterministic for identical input', () => {
    const log = [entry('2026-05-13', 'diesel', 40)];
    const a = summarizeCo2(log, NOW);
    const b = summarizeCo2(log, NOW);
    expect(a).toEqual(b);
  });

  it('rounds monthly numeric fields to 2 decimals', () => {
    const log = [entry('2026-05-13', 'diesel', 40.123)];
    const r = summarizeCo2(log, NOW);
    const m = r.monthly[0]!;
    // Compare against the explicitly-rounded value with a tiny
    // tolerance — `Number.isInteger(x*100)` would be too strict
    // because IEEE-754 introduces 0.0000001 drift on multiplication.
    expect(m.liters).toBeCloseTo(Math.round(m.liters * 100) / 100, 5);
    expect(m.co2Kg).toBeCloseTo(Math.round(m.co2Kg * 100) / 100, 5);
    expect(m.costEur).toBeCloseTo(Math.round(m.costEur * 100) / 100, 5);
  });
});
