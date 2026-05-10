import { describe, it, expect } from 'vitest';
import { computeAchievements } from '../achievements';
import type { FuelLogEntry } from '../../domain/types';

function fill(date: string, brand: string, station: string, liters = 40): FuelLogEntry {
  return {
    id: `${date}-${brand}`,
    date,
    stationName: station,
    stationBrand: brand,
    fuelType: 'diesel',
    liters,
    pricePerLiter: 1.7,
    totalCost: 1.7 * liters,
  };
}

describe('computeAchievements', () => {
  it('returns all achievements locked on empty input', () => {
    const r = computeAchievements([], []);
    expect(r.unlockedCount).toBe(0);
    expect(r.totalCount).toBeGreaterThan(0);
    expect(r.points).toBe(0);
    expect(r.latest).toBeNull();
  });

  it('unlocks first-fill on a single entry', () => {
    const r = computeAchievements([fill('2026-05-13T12:00:00Z', 'Aral', 'A')], []);
    expect(r.achievements.find((a) => a.id === 'first-fill')?.unlocked).toBe(true);
    expect(r.points).toBeGreaterThanOrEqual(10);
  });

  it('unlocks fills-10 at 10 entries', () => {
    const log = Array.from({ length: 10 }, (_, i) =>
      fill(`2026-${String(i + 1).padStart(2, '0')}-01T12:00:00Z`, 'Aral', `S${i}`),
    );
    const r = computeAchievements(log, []);
    expect(r.achievements.find((a) => a.id === 'fills-10')?.unlocked).toBe(true);
    expect(r.achievements.find((a) => a.id === 'fills-50')?.unlocked).toBe(false);
  });

  it('liter-500 progress is 0.5 after 250 L', () => {
    const log = [
      fill('2026-04-01T12:00:00Z', 'Aral', 'A', 100),
      fill('2026-05-01T12:00:00Z', 'Shell', 'B', 150),
    ];
    const r = computeAchievements(log, []);
    const liters500 = r.achievements.find((a) => a.id === 'liters-500');
    expect(liters500?.progress).toBeCloseTo(0.5, 1);
    expect(liters500?.current).toBe(250);
  });

  it('unlocks brands-3 with three distinct brands', () => {
    const log = [
      fill('2026-05-01T12:00:00Z', 'Aral', 'A'),
      fill('2026-05-02T12:00:00Z', 'Shell', 'B'),
      fill('2026-05-03T12:00:00Z', 'Esso', 'C'),
    ];
    const r = computeAchievements(log, []);
    expect(r.achievements.find((a) => a.id === 'brands-3')?.unlocked).toBe(true);
  });

  it('unlocks smart-time-of-day for an early-morning fill', () => {
    const log = [fill('2026-05-13T05:30:00Z', 'Aral', 'A')];
    const r = computeAchievements(log, []);
    expect(r.achievements.find((a) => a.id === 'smart-time-of-day')?.unlocked).toBe(true);
  });

  it('does NOT unlock smart-time-of-day for a midday-only log', () => {
    const log = [fill('2026-05-13T13:30:00Z', 'Aral', 'A')];
    const r = computeAchievements(log, []);
    expect(r.achievements.find((a) => a.id === 'smart-time-of-day')?.unlocked).toBe(false);
  });

  it('places unlocked achievements before locked ones', () => {
    const r = computeAchievements([fill('2026-05-13T12:00:00Z', 'Aral', 'A')], []);
    const firstUnlockedIdx = r.achievements.findIndex((a) => a.unlocked);
    const firstLockedIdx = r.achievements.findIndex((a) => !a.unlocked);
    expect(firstUnlockedIdx).toBeLessThan(firstLockedIdx);
  });

  it('locked achievements sort by descending progress', () => {
    // 4 fills + 2 brands → fills-10 has progress 0.4, brands-3 has progress 0.66
    const log = [
      fill('2026-05-01T12:00:00Z', 'Aral', 'A'),
      fill('2026-05-02T12:00:00Z', 'Shell', 'B'),
      fill('2026-05-03T12:00:00Z', 'Aral', 'C'),
      fill('2026-05-04T12:00:00Z', 'Shell', 'D'),
    ];
    const r = computeAchievements(log, []);
    const locked = r.achievements.filter((a) => !a.unlocked);
    for (let i = 1; i < locked.length; i++) {
      expect(locked[i - 1]!.progress).toBeGreaterThanOrEqual(locked[i]!.progress);
    }
  });
});
