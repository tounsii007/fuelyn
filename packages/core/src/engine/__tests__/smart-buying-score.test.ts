// ============================================================
// computeSmartBuyingScore — tests against synthetic markets.
// ============================================================

import { describe, it, expect } from 'vitest';
import { computeSmartBuyingScore } from '../smart-buying-score';
import type { FuelLogEntry } from '../../domain/types';

type TypedSnap = { timestamp: string; price: number; fuelType?: 'diesel' | 'e5' | 'e10' };

function fill(date: string, price: number, liters = 40): FuelLogEntry {
  return {
    id: `f-${date}-${price}`,
    date,
    stationName: 'Test',
    stationBrand: 'Test',
    fuelType: 'diesel',
    liters,
    pricePerLiter: price,
    totalCost: price * liters,
  };
}

/**
 * Build a uniform daily market series at the given price ±jitter
 * for `days` consecutive days ending at `until`.
 */
function uniformMarket(until: string, days: number, basePrice: number, jitter = 0.02): TypedSnap[] {
  const out: TypedSnap[] = [];
  const end = Date.parse(until);
  for (let d = 0; d < days; d++) {
    for (let h = 0; h < 24; h += 6) {
      const ts = end - d * 24 * 3600 * 1000 + h * 3600 * 1000;
      // Symmetric jitter: half the samples below base, half above.
      // (i % 7) − 3 ranges -3..+3 so the mean stays at basePrice.
      const i = d * 4 + h / 6;
      const offset = ((i % 7) - 3) * (jitter / 3);
      out.push({
        timestamp: new Date(ts).toISOString(),
        price: Math.round((basePrice + offset) * 1000) / 1000,
        fuelType: 'diesel',
      });
    }
  }
  return out;
}

describe('computeSmartBuyingScore — empty / minimal', () => {
  it('returns neutral 50 score with zero confidence on empty log', () => {
    const r = computeSmartBuyingScore({ log: [], market: [] });
    expect(r.score).toBe(50);
    expect(r.confidence).toBe(0);
    expect(r.evaluatedFills).toBe(0);
    expect(r.band).toBe('average');
  });

  it('skips fills without market context (sparse market)', () => {
    const r = computeSmartBuyingScore({
      log: [fill('2026-05-13T12:00:00Z', 1.7)],
      market: [], // empty market = no context
    });
    expect(r.evaluatedFills).toBe(0);
    expect(r.skippedFills).toBe(1);
  });

  it('skips fills with malformed price/date', () => {
    const r = computeSmartBuyingScore({
      log: [
        { ...fill('2026-05-13T12:00:00Z', 1.7), pricePerLiter: NaN },
        { ...fill('not-a-date', 1.7) },
      ],
      market: uniformMarket('2026-05-13T00:00:00Z', 14, 1.8),
    });
    expect(r.evaluatedFills).toBe(0);
    expect(r.skippedFills).toBe(2);
  });
});

describe('computeSmartBuyingScore — directional checks', () => {
  it('user beats the market consistently → high score (≥70)', () => {
    // 5 fills all 6 ct below the market average → great score
    const market = uniformMarket('2026-05-13T00:00:00Z', 30, 1.80);
    const log = [
      fill('2026-05-13T12:00:00Z', 1.74),
      fill('2026-05-08T12:00:00Z', 1.74),
      fill('2026-05-03T12:00:00Z', 1.74),
      fill('2026-04-28T12:00:00Z', 1.74),
      fill('2026-04-23T12:00:00Z', 1.74),
    ];
    const r = computeSmartBuyingScore({ log, market });
    expect(r.evaluatedFills).toBe(5);
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.components.consistency).toBe(1.0);
    expect(r.totalEdgeEur).toBeGreaterThan(0);
    expect(['great', 'excellent']).toContain(r.band);
  });

  it('user always overpays → low score (≤30)', () => {
    const market = uniformMarket('2026-05-13T00:00:00Z', 30, 1.80);
    const log = [
      fill('2026-05-13T12:00:00Z', 1.92),
      fill('2026-05-08T12:00:00Z', 1.92),
      fill('2026-05-03T12:00:00Z', 1.92),
      fill('2026-04-28T12:00:00Z', 1.92),
      fill('2026-04-23T12:00:00Z', 1.92),
    ];
    const r = computeSmartBuyingScore({ log, market });
    expect(r.score).toBeLessThanOrEqual(30);
    expect(r.components.consistency).toBe(0);
    expect(r.totalEdgeEur).toBeLessThan(0);
    expect(['below-average', 'poor']).toContain(r.band);
  });

  it('user pays exactly market → middle-ish score', () => {
    const market = uniformMarket('2026-05-13T00:00:00Z', 30, 1.80);
    // Use a fill price equal to the rounded market mean.
    // Skip actual mean computation; instead use base 1.80
    // (the synthetic series oscillates by tiny amounts which
    // averages to ~1.80).
    const log = [
      fill('2026-05-13T12:00:00Z', 1.80),
      fill('2026-05-10T12:00:00Z', 1.80),
      fill('2026-05-05T12:00:00Z', 1.80),
    ];
    const r = computeSmartBuyingScore({ log, market });
    expect(r.score).toBeGreaterThan(35);
    expect(r.score).toBeLessThan(65);
  });
});

describe('computeSmartBuyingScore — confidence', () => {
  it('confidence increases with more evaluated fills', () => {
    const market = uniformMarket('2026-05-13T00:00:00Z', 30, 1.80);
    const single = computeSmartBuyingScore({
      log: [fill('2026-05-13T12:00:00Z', 1.74)],
      market,
    });
    const tenLog: FuelLogEntry[] = [];
    for (let i = 0; i < 10; i++) {
      const date = new Date(Date.UTC(2026, 4, 1 + i, 12)).toISOString();
      tenLog.push(fill(date, 1.74));
    }
    const ten = computeSmartBuyingScore({ log: tenLog, market });
    expect(ten.confidence).toBeGreaterThan(single.confidence);
  });

  it('confidence drops when most fills are skipped', () => {
    // Market only covers May; user has fills in January (no
    // market data within ±14 days).
    const market = uniformMarket('2026-05-13T00:00:00Z', 14, 1.80);
    const log = [
      fill('2026-01-05T12:00:00Z', 1.7),
      fill('2026-01-15T12:00:00Z', 1.7),
      fill('2026-05-12T12:00:00Z', 1.7), // only this one matches
    ];
    const r = computeSmartBuyingScore({ log, market });
    expect(r.evaluatedFills).toBe(1);
    expect(r.skippedFills).toBe(2);
    // 2 of 3 skipped → skipRate 0.667 → confidence ≤ 0.5 floor
    expect(r.confidence).toBeLessThan(0.5);
  });
});

describe('computeSmartBuyingScore — output stability', () => {
  it('is deterministic for identical input', () => {
    const market = uniformMarket('2026-05-13T00:00:00Z', 30, 1.80);
    const log = [fill('2026-05-13T12:00:00Z', 1.74)];
    const a = computeSmartBuyingScore({ log, market });
    const b = computeSmartBuyingScore({ log, market });
    expect(a).toEqual(b);
  });

  it('score in [0, 100]', () => {
    // Adversarial: extreme over-payment shouldn't push score < 0.
    const market = uniformMarket('2026-05-13T00:00:00Z', 30, 1.80);
    const log = [fill('2026-05-13T12:00:00Z', 5.0)]; // 3.20 over market
    const r = computeSmartBuyingScore({ log, market });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('confidence in [0, 1]', () => {
    const market = uniformMarket('2026-05-13T00:00:00Z', 30, 1.80);
    const log = [fill('2026-05-13T12:00:00Z', 1.74)];
    const r = computeSmartBuyingScore({ log, market });
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});

describe('computeSmartBuyingScore — fuel-type filter', () => {
  it('only evaluates fills of the requested fuel type', () => {
    const market: TypedSnap[] = [
      ...uniformMarket('2026-05-13T00:00:00Z', 14, 1.80).map((s) => ({
        ...s,
        fuelType: 'diesel' as const,
      })),
      ...uniformMarket('2026-05-13T00:00:00Z', 14, 1.70).map((s) => ({
        ...s,
        fuelType: 'e10' as const,
      })),
    ];
    const log: FuelLogEntry[] = [
      { ...fill('2026-05-13T12:00:00Z', 1.74), fuelType: 'diesel' },
      { ...fill('2026-05-12T12:00:00Z', 1.65), fuelType: 'e10' },
    ];
    const dieselOnly = computeSmartBuyingScore({ log, market, fuelType: 'diesel' });
    expect(dieselOnly.evaluatedFills).toBe(1);
  });
});
