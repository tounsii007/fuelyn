import { describe, expect, it } from 'vitest';
import {
  analyzePrices,
  dayOfWeekExtremes,
  fallbackRecommendation,
  PRICE_INTELLIGENCE_DEFAULTS,
  type PriceDataInput,
} from './price-intelligence';

function buildSeries(prices: number[], startIso = '2026-01-01T12:00:00Z'): PriceDataInput[] {
  const start = new Date(startIso).getTime();
  return prices.map((price, i) => ({
    price,
    timestamp: new Date(start + i * 86_400_000).toISOString(),
  }));
}

describe('analyzePrices', () => {
  it('returns fallback when fewer than minDataPoints points are given', () => {
    const out = analyzePrices(buildSeries([1.6, 1.7, 1.65]));
    expect(out.confidence).toBe('low');
    expect(out.savingsEstimate).toBe(0);
    expect(out.headline).toContain('genug Daten');
  });

  it('flags rising trend and recommends "buy_now"', () => {
    const series = buildSeries([1.6, 1.62, 1.64, 1.66, 1.69, 1.72, 1.74]);
    const out = analyzePrices(series, 'e10', 50);
    expect(out.trend).toBeGreaterThan(PRICE_INTELLIGENCE_DEFAULTS.trendThreshold);
    expect(out.action).toBe('buy_now');
  });

  it('falling trend AND below average → buy_now (lock in the dip)', () => {
    const series = buildSeries([1.8, 1.78, 1.76, 1.72, 1.7, 1.68, 1.66]);
    const out = analyzePrices(series, 'e10', 50);
    expect(out.trend).toBeLessThan(-PRICE_INTELLIGENCE_DEFAULTS.trendThreshold);
    expect(out.action).toBe('buy_now');
  });

  it('falling trend with current price near average → wait', () => {
    // Constructed so the recent 3-pt average is below the earlier window
    // (= falling), but the very last point is back near the overall mean,
    // so it is not "below average" → engine recommends wait.
    const series = buildSeries([1.7, 1.8, 1.85, 1.78, 1.82, 1.79, 1.8]);
    const out = analyzePrices(series, 'e10', 50);
    expect(out.trend).toBeLessThan(0);
    expect(out.action).toBe('wait');
  });

  it('savingsEstimate equals (max-min)*fillUpLiters rounded', () => {
    const out = analyzePrices(buildSeries([1.6, 1.65, 1.7, 1.8, 1.82]), 'e10', 50);
    // spread 1.82-1.6=0.22, *50 = 11.0
    expect(out.savingsEstimate).toBe(11);
  });

  it('confidence is "high" with many points and visible trend', () => {
    const rising: number[] = Array.from({ length: 16 }, (_, i) => 1.6 + i * 0.01);
    const out = analyzePrices(buildSeries(rising), 'e10', 50);
    expect(out.confidence).toBe('high');
  });

  it('returns valid German day labels when the data is rich enough', () => {
    // 14 daily points → 2 of each weekday → meets MIN_SAMPLES_PER_DAY.
    // Mid-week dip introduces real cross-day variance.
    const series = buildSeries([
      1.70, 1.72, 1.74, 1.65, 1.68, 1.71, 1.73,
      1.71, 1.73, 1.75, 1.66, 1.69, 1.72, 1.74,
    ]);
    const out = analyzePrices(series, 'e10', 50);
    expect([
      'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag',
      'Freitag', 'Samstag', 'Sonntag', null,
    ]).toContain(out.cheapestDay);
  });

  it('NEVER produces a self-contradicting "fallen X. Vermeide X." tip', () => {
    // Regression test for the original bug: with all data on a
    // single weekday OR a flat price, cheapest === expensive used
    // to leak through into a contradictory bestTimePrediction.
    const allMonday = Array.from({ length: 8 }, (_, i) => ({
      price: 1.70,
      // Every entry on the same Monday (2026-01-05) one hour apart.
      timestamp: new Date(Date.parse('2026-01-05T08:00:00Z') + i * 3_600_000).toISOString(),
    }));
    const out = analyzePrices(allMonday, 'e10', 50);

    // The pair must never collide.
    if (out.cheapestDay && out.expensiveDay) {
      expect(out.cheapestDay).not.toBe(out.expensiveDay);
    }
    // And the rendered tip must be free of the "X. Vermeide X." pattern.
    const dayWord = /(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)/g;
    const matches = out.bestTimePrediction.match(dayWord) ?? [];
    if (matches.length === 2) {
      expect(matches[0]).not.toBe(matches[1]);
    }
  });
});

describe('dayOfWeekExtremes', () => {
  it('returns null/null when only one weekday has samples', () => {
    const sameDay: PriceDataInput[] = Array.from({ length: 5 }, (_, i) => ({
      price: 1.70 + i * 0.01,
      timestamp: new Date(Date.parse('2026-01-05T08:00:00Z') + i * 3_600_000).toISOString(),
    }));
    const out = dayOfWeekExtremes(sameDay);
    expect(out.cheapestDay).toBeNull();
    expect(out.expensiveDay).toBeNull();
  });

  it('returns null/null when prices are flat across the week', () => {
    // Two weeks of perfectly flat prices — variance below threshold.
    const flat = buildSeries(Array.from({ length: 14 }, () => 1.70));
    const out = dayOfWeekExtremes(flat);
    expect(out.cheapestDay).toBeNull();
    expect(out.expensiveDay).toBeNull();
  });

  it('returns distinct days when there is a real weekday pattern', () => {
    // Two full weeks: cheaper on Tuesdays (idx 2 from 2026-01-06),
    // pricier on Saturdays. Day-0 = 2026-01-01 = Thursday.
    // Build the index → day mapping carefully:
    //   2026-01-01 Thu  | 02 Fri | 03 Sat | 04 Sun | 05 Mon | 06 Tue | 07 Wed
    //   2026-01-08 Thu  | 09 Fri | 10 Sat | 11 Sun | 12 Mon | 13 Tue | 14 Wed
    // → idx 5,12 = Tuesday (cheap)   idx 2,9 = Saturday (expensive)
    const prices = [
      /* Thu */ 1.72, /* Fri */ 1.73, /* Sat */ 1.78, /* Sun */ 1.74,
      /* Mon */ 1.71, /* Tue */ 1.66, /* Wed */ 1.70,
      /* Thu */ 1.72, /* Fri */ 1.74, /* Sat */ 1.79, /* Sun */ 1.74,
      /* Mon */ 1.72, /* Tue */ 1.65, /* Wed */ 1.70,
    ];
    const out = dayOfWeekExtremes(buildSeries(prices));
    expect(out.cheapestDay).toBe('Dienstag');
    expect(out.expensiveDay).toBe('Samstag');
  });

  it('filters out non-finite or non-positive prices', () => {
    const dirty: PriceDataInput[] = [
      { price: 1.6, timestamp: '2026-01-01T00:00:00Z' },
      { price: Number.NaN, timestamp: '2026-01-02T00:00:00Z' },
      { price: -1, timestamp: '2026-01-03T00:00:00Z' },
      { price: 1.7, timestamp: '2026-01-04T00:00:00Z' },
      { price: 1.65, timestamp: '2026-01-05T00:00:00Z' },
      { price: 1.68, timestamp: '2026-01-06T00:00:00Z' },
    ];
    expect(() => analyzePrices(dirty)).not.toThrow();
  });
});

describe('fallbackRecommendation', () => {
  it('uses default fillUpLiters when omitted', () => {
    const out = fallbackRecommendation();
    expect(out.fillUpLiters).toBe(PRICE_INTELLIGENCE_DEFAULTS.fillUpLiters);
    expect(out.action).toBe('wait');
  });
});
