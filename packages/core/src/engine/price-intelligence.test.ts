import { describe, expect, it } from 'vitest';
import {
  analyzePrices,
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

  it('returns valid German day labels', () => {
    const out = analyzePrices(buildSeries([1.6, 1.65, 1.7, 1.55, 1.58, 1.6]), 'e10', 50);
    expect([
      'Montag',
      'Dienstag',
      'Mittwoch',
      'Donnerstag',
      'Freitag',
      'Samstag',
      'Sonntag',
    ]).toContain(out.cheapestDay);
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
