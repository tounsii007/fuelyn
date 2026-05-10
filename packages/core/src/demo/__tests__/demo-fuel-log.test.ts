// ============================================================
// Demo-data generator tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import { generateDemoFuelLog } from '../demo-fuel-log';

const NOW = new Date('2026-05-10T12:00:00Z');

describe('generateDemoFuelLog', () => {
  it('produces the requested count', () => {
    expect(generateDemoFuelLog({ now: NOW, count: 14 })).toHaveLength(14);
    expect(generateDemoFuelLog({ now: NOW, count: 5 })).toHaveLength(5);
  });

  it('is deterministic for a given seed', () => {
    const a = generateDemoFuelLog({ now: NOW, seed: 1 });
    const b = generateDemoFuelLog({ now: NOW, seed: 1 });
    expect(a).toEqual(b);
  });

  it('is different for different seeds', () => {
    const a = generateDemoFuelLog({ now: NOW, seed: 1 });
    const b = generateDemoFuelLog({ now: NOW, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it('every entry has plausible price + liters', () => {
    for (const e of generateDemoFuelLog({ now: NOW })) {
      expect(e.pricePerLiter).toBeGreaterThan(1.50);
      expect(e.pricePerLiter).toBeLessThan(2.00);
      expect(e.liters).toBeGreaterThan(15);
      expect(e.liters).toBeLessThan(60);
      expect(e.totalCost).toBeCloseTo(
        Math.round(e.liters * e.pricePerLiter * 100) / 100,
        1,
      );
    }
  });

  it('newest entry first', () => {
    const log = generateDemoFuelLog({ now: NOW });
    for (let i = 1; i < log.length; i++) {
      expect(log[i - 1]!.date >= log[i]!.date).toBe(true);
    }
  });

  it('every entry uses the requested fuel type', () => {
    for (const e of generateDemoFuelLog({ now: NOW, fuelType: 'diesel' })) {
      expect(e.fuelType).toBe('diesel');
    }
  });

  it('first entry carries a "demo" note so users know it can be deleted', () => {
    const log = generateDemoFuelLog({ now: NOW });
    expect(log[0]?.note ?? '').toMatch(/demo/i);
  });

  it('newest entry is within the last 48 h', () => {
    const log = generateDemoFuelLog({ now: NOW });
    const newest = new Date(log[0]!.date);
    expect(NOW.getTime() - newest.getTime()).toBeLessThan(2 * 24 * 60 * 60 * 1000);
  });
});
