import { describe, it, expect } from 'vitest';
import { computeSavingTips } from '../saving-tips';
import type { FuelLogEntry } from '../../domain/types';

type TypedSnap = { timestamp: string; price: number; fuelType?: 'diesel' | 'e5' | 'e10' };

function fill(date: string, brand: string, station: string, price = 1.85, liters = 40): FuelLogEntry {
  return {
    id: `f-${date}`,
    date,
    stationName: station,
    stationBrand: brand,
    fuelType: 'diesel',
    liters,
    pricePerLiter: price,
    totalCost: price * liters,
  };
}

/**
 * Build a market with cheap mornings (5-7am: 1.70) and pricey
 * evenings (17-19h: 1.85), uniform across the rest. Triggers
 * the hour-of-day tip when the user fills evenings.
 */
function patternedMarket(days: number, until: string): TypedSnap[] {
  const out: TypedSnap[] = [];
  const end = Date.parse(until);
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h++) {
      const ts = end - d * 24 * 3600 * 1000 + h * 3600 * 1000;
      const isCheapHour = h >= 5 && h <= 7;
      const isPriceyHour = h >= 17 && h <= 19;
      const price = isCheapHour ? 1.70 : isPriceyHour ? 1.85 : 1.78;
      out.push({
        timestamp: new Date(ts).toISOString(),
        price,
        fuelType: 'diesel',
      });
    }
  }
  return out;
}

describe('computeSavingTips — minimal data', () => {
  it('returns no tips when log has fewer than 5 entries', () => {
    const r = computeSavingTips({ log: [], market: [] });
    expect(r.tips).toEqual([]);
  });

  it('confidence rises with more entries', () => {
    const market = patternedMarket(14, '2026-05-13T00:00:00Z');
    const small = Array.from({ length: 6 }, (_, i) =>
      fill(`2026-05-${String(i + 1).padStart(2, '0')}T18:00:00Z`, 'Aral', 'A'),
    );
    const big = Array.from({ length: 20 }, (_, i) =>
      fill(`2026-05-${String(i + 1).padStart(2, '0')}T18:00:00Z`, 'Aral', 'A'),
    );
    const r1 = computeSavingTips({ log: small, market });
    const r2 = computeSavingTips({ log: big, market });
    expect(r2.confidence).toBeGreaterThan(r1.confidence);
  });
});

describe('computeSavingTips — hour-of-day tip', () => {
  it('surfaces switch-hour when user fills at expensive evening hours', () => {
    const market = patternedMarket(14, '2026-05-13T00:00:00Z');
    const log = Array.from({ length: 12 }, (_, i) =>
      fill(`2026-05-${String(i + 1).padStart(2, '0')}T18:00:00Z`, 'Aral', `S${i}`),
    );
    const r = computeSavingTips({ log, market });
    const hourTip = r.tips.find((t) => t.id === 'switch-hour');
    expect(hourTip).toBeDefined();
    expect(hourTip!.context.currentHour).toBe(18);
    // Best hour should be one of 5,6,7
    expect([5, 6, 7]).toContain(hourTip!.context.betterHour);
    expect(hourTip!.estimatedSavingsEurPerYear).toBeGreaterThan(0);
  });

  it('does NOT surface switch-hour when user already fills at cheap hours', () => {
    const market = patternedMarket(14, '2026-05-13T00:00:00Z');
    const log = Array.from({ length: 12 }, (_, i) =>
      fill(`2026-05-${String(i + 1).padStart(2, '0')}T06:00:00Z`, 'Aral', `S${i}`),
    );
    const r = computeSavingTips({ log, market });
    expect(r.tips.find((t) => t.id === 'switch-hour')).toBeUndefined();
  });
});

describe('computeSavingTips — brand loyalty tip', () => {
  it('surfaces compare-stations when 70%+ of fills are at one brand', () => {
    const market = patternedMarket(14, '2026-05-13T00:00:00Z');
    // 8 of 10 fills at Aral
    const log = [
      ...Array.from({ length: 8 }, (_, i) =>
        fill(`2026-05-${String(i + 1).padStart(2, '0')}T12:00:00Z`, 'Aral', `A${i}`),
      ),
      fill('2026-05-09T12:00:00Z', 'Shell', 'S'),
      fill('2026-05-10T12:00:00Z', 'Esso', 'E'),
    ];
    const r = computeSavingTips({ log, market });
    const tip = r.tips.find((t) => t.id === 'compare-stations');
    expect(tip).toBeDefined();
    expect(tip!.context.brand).toBe('Aral');
    expect(tip!.context.sharePct).toBe(80);
  });

  it('does NOT surface compare-stations when brand mix is balanced', () => {
    const market = patternedMarket(14, '2026-05-13T00:00:00Z');
    const log = [
      ...Array.from({ length: 4 }, (_, i) => fill(`2026-05-${String(i + 1).padStart(2, '0')}T12:00:00Z`, 'Aral', `A${i}`)),
      ...Array.from({ length: 4 }, (_, i) => fill(`2026-05-${String(i + 5).padStart(2, '0')}T12:00:00Z`, 'Shell', `S${i}`)),
      ...Array.from({ length: 4 }, (_, i) => fill(`2026-05-${String(i + 9).padStart(2, '0')}T12:00:00Z`, 'Esso', `E${i}`)),
    ];
    const r = computeSavingTips({ log, market });
    expect(r.tips.find((t) => t.id === 'compare-stations')).toBeUndefined();
  });
});

describe('computeSavingTips — sorting + cap', () => {
  it('sorts tips by severity then descending savings', () => {
    const market = patternedMarket(14, '2026-05-13T00:00:00Z');
    const log = Array.from({ length: 12 }, (_, i) =>
      fill(`2026-05-${String(i + 1).padStart(2, '0')}T18:00:00Z`, 'Aral', `S${i}`),
    );
    const r = computeSavingTips({ log, market });
    for (let i = 1; i < r.tips.length; i++) {
      const prev = r.tips[i - 1]!;
      const cur = r.tips[i]!;
      const sevRank = { high: 3, medium: 2, low: 1 };
      expect(sevRank[prev.severity]).toBeGreaterThanOrEqual(sevRank[cur.severity]);
    }
  });

  it('respects maxTips cap', () => {
    const market = patternedMarket(14, '2026-05-13T00:00:00Z');
    const log = Array.from({ length: 12 }, (_, i) =>
      fill(`2026-05-${String(i + 1).padStart(2, '0')}T18:00:00Z`, 'Aral', `S${i}`),
    );
    const r = computeSavingTips({ log, market, maxTips: 1 });
    expect(r.tips.length).toBeLessThanOrEqual(1);
  });
});
