// ============================================================
// predictNext24h — synthetic-series tests for the lightweight
// price prediction engine.
//
// We construct snapshot histories with KNOWN structure (e.g.
// "always cheaper at 6am, always more expensive at 5pm") and
// assert the model picks up that structure. Real market noise
// is approximated by a small jitter so the deterministic tests
// don't accidentally over-fit on perfectly clean signals.
// ============================================================

import { describe, it, expect } from 'vitest';
import { predictNext24h, type PriceSnapshot } from '../price-prediction';

const NOW = new Date('2026-05-13T12:00:00Z');

/**
 * Generate `days` of hourly snapshots with a known shape:
 *   price(hour) = base + amplitude * sin((hour-12)/24 * 2π)
 *
 * Phase-shifted so the trough sits at hour 6 (early morning,
 * sin(-π/2) = -1 → cheapest) and the peak at hour 18 (early
 * evening, sin(+π/2) = +1 → most expensive). Adds tiny
 * deterministic jitter so the per-bucket variance isn't
 * exactly zero (the model down-weights zero-variance buckets).
 */
function syntheticSeries(days: number, base = 1.7, amplitude = 0.05): PriceSnapshot[] {
  const out: PriceSnapshot[] = [];
  const start = NOW.getTime() - days * 24 * 3600 * 1000;
  for (let i = 0; i < days * 24; i++) {
    const ts = start + i * 3600 * 1000;
    const d = new Date(ts);
    const hour = d.getHours();
    const seasonal = amplitude * Math.sin(((hour - 12) / 24) * 2 * Math.PI);
    // Tiny deterministic jitter via a hash-ish function so each
    // hour's bucket has > 1 distinct value (variance > 0).
    const jitter = ((i * 13) % 7) * 0.0005;
    out.push({
      timestamp: d.toISOString(),
      price: Math.round((base + seasonal + jitter) * 1000) / 1000,
    });
  }
  return out;
}

describe('predictNext24h — insufficient data', () => {
  it('returns insufficient-data + zero confidence when history is empty', () => {
    const r = predictNext24h([], { now: NOW });
    expect(r.rationale).toBe('insufficient-data');
    expect(r.confidence).toBe(0);
    expect(r.hourly).toHaveLength(24);
    // Trace should be flat at price 0 when truly empty
    expect(r.bestHour.price).toBe(0);
    expect(r.worstHour.price).toBe(0);
    expect(r.spreadEurPerL).toBe(0);
  });

  it('uses the last known price for a too-short history', () => {
    const r = predictNext24h(
      [
        { timestamp: '2026-05-13T10:00:00Z', price: 1.799 },
        { timestamp: '2026-05-13T11:00:00Z', price: 1.795 },
      ],
      { now: NOW },
    );
    expect(r.rationale).toBe('insufficient-data');
    expect(r.bestHour.price).toBeCloseTo(1.795, 2);
    expect(r.confidence).toBe(0);
  });

  it('skips invalid samples (NaN, non-positive, malformed timestamps)', () => {
    const dirty: PriceSnapshot[] = [
      { timestamp: 'not-a-date', price: 1.7 },
      { timestamp: '2026-05-13T10:00:00Z', price: 0 },
      { timestamp: '2026-05-13T10:00:00Z', price: -5 },
      { timestamp: '2026-05-13T10:00:00Z', price: NaN },
      { timestamp: '2026-05-13T10:00:00Z', price: 100 }, // > 10 €/L cap
    ];
    const r = predictNext24h(dirty, { now: NOW });
    // All five samples are dropped → empty data path
    expect(r.rationale).toBe('insufficient-data');
  });
});

describe('predictNext24h — picks up hourly seasonality', () => {
  it('identifies early-morning as cheap and early-evening as expensive', () => {
    const r = predictNext24h(syntheticSeries(10), { now: NOW });
    // bestHour should be in the morning band (4-9)
    expect(r.bestHour.hour).toBeGreaterThanOrEqual(4);
    expect(r.bestHour.hour).toBeLessThanOrEqual(9);
    // worstHour should be late afternoon / evening (15-20)
    expect(r.worstHour.hour).toBeGreaterThanOrEqual(15);
    expect(r.worstHour.hour).toBeLessThanOrEqual(20);
  });

  it('returns a non-zero spread when the synthetic pattern has amplitude', () => {
    const r = predictNext24h(syntheticSeries(10, 1.7, 0.08), { now: NOW });
    // Designed amplitude = 0.08 around base; predicted spread
    // should be at least a meaningful fraction (> 0.03 €/L)
    expect(r.spreadEurPerL).toBeGreaterThan(0.03);
  });

  it('returns 24 hourly entries with consecutive offsets 0–23', () => {
    const r = predictNext24h(syntheticSeries(10), { now: NOW });
    expect(r.hourly).toHaveLength(24);
    r.hourly.forEach((h, i) => {
      expect(h.offsetHours).toBe(i);
      expect(h.hour).toBeGreaterThanOrEqual(0);
      expect(h.hour).toBeLessThanOrEqual(23);
    });
  });
});

describe('predictNext24h — trend detection', () => {
  it('classifies a rising series as up-trending', () => {
    // Build 8 days: price climbs by 0.02 €/L per day
    const series: PriceSnapshot[] = [];
    const base = 1.7;
    const start = NOW.getTime() - 8 * 24 * 3600 * 1000;
    for (let i = 0; i < 8 * 24; i++) {
      const day = i / 24;
      series.push({
        timestamp: new Date(start + i * 3600 * 1000).toISOString(),
        price: Math.round((base + day * 0.02) * 1000) / 1000,
      });
    }
    const r = predictNext24h(series, { now: NOW });
    expect(r.rationale).toBe('up-trending');
  });

  it('classifies a falling series as down-trending', () => {
    const series: PriceSnapshot[] = [];
    const base = 1.9;
    const start = NOW.getTime() - 8 * 24 * 3600 * 1000;
    for (let i = 0; i < 8 * 24; i++) {
      const day = i / 24;
      series.push({
        timestamp: new Date(start + i * 3600 * 1000).toISOString(),
        price: Math.round((base - day * 0.02) * 1000) / 1000,
      });
    }
    const r = predictNext24h(series, { now: NOW });
    expect(r.rationale).toBe('down-trending');
  });

  it('classifies a flat-with-pattern series as stable-with-pattern', () => {
    const r = predictNext24h(syntheticSeries(10), { now: NOW });
    expect(r.rationale).toBe('stable-with-pattern');
  });
});

describe('predictNext24h — confidence', () => {
  it('reports high confidence (≥0.6) for ≥7 days of low-variance data', () => {
    const r = predictNext24h(syntheticSeries(14, 1.7, 0.04), { now: NOW });
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
    expect(r.confidence).toBeLessThanOrEqual(1.0);
  });

  it('reports low confidence (<0.5) for short data', () => {
    const r = predictNext24h(syntheticSeries(2, 1.7, 0.04), { now: NOW });
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('confidence stays in [0, 1] even for adversarial inputs', () => {
    // Wildly noisy series: prices jump randomly between 1.0 and
    // 2.5 each hour. The pattern signal is completely drowned.
    const noisy: PriceSnapshot[] = [];
    const start = NOW.getTime() - 14 * 24 * 3600 * 1000;
    for (let i = 0; i < 14 * 24; i++) {
      noisy.push({
        timestamp: new Date(start + i * 3600 * 1000).toISOString(),
        price: 1.0 + ((i * 37) % 100) / 60,
      });
    }
    const r = predictNext24h(noisy, { now: NOW });
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});

describe('predictNext24h — output stability', () => {
  it('predictions are deterministic for identical input', () => {
    const series = syntheticSeries(10);
    const r1 = predictNext24h(series, { now: NOW });
    const r2 = predictNext24h(series, { now: NOW });
    expect(r1).toEqual(r2);
  });

  it('all predicted prices are non-negative', () => {
    const r = predictNext24h(syntheticSeries(10), { now: NOW });
    r.hourly.forEach((h) => expect(h.price).toBeGreaterThanOrEqual(0));
  });

  it('best ≤ worst by definition', () => {
    const r = predictNext24h(syntheticSeries(10), { now: NOW });
    expect(r.bestHour.price).toBeLessThanOrEqual(r.worstHour.price);
  });
});
