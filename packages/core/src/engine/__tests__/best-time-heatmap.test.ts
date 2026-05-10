// ============================================================
// buildBestTimeHeatmap — synthetic-pattern tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { buildBestTimeHeatmap, type PriceSnapshot } from '../best-time-heatmap';

describe('buildBestTimeHeatmap — empty / minimal', () => {
  it('returns empty grid + zero confidence on no data', () => {
    const r = buildBestTimeHeatmap([]);
    expect(r.cells).toHaveLength(7);
    expect(r.cells[0]).toHaveLength(24);
    expect(r.bestCell).toBeNull();
    expect(r.worstCell).toBeNull();
    expect(r.globalMean).toBeNull();
    expect(r.sampleCount).toBe(0);
    expect(r.confidence).toBe(0);
  });

  it('rejects malformed snapshots', () => {
    const dirty: PriceSnapshot[] = [
      { timestamp: 'x', price: 1.7 },
      { timestamp: '2026-05-13T10:00:00Z', price: 0 },
      { timestamp: '2026-05-13T10:00:00Z', price: -1 },
      { timestamp: '2026-05-13T10:00:00Z', price: NaN },
      { timestamp: '2026-05-13T10:00:00Z', price: 100 }, // > 10 cap
    ];
    expect(buildBestTimeHeatmap(dirty).sampleCount).toBe(0);
  });
});

describe('buildBestTimeHeatmap — bucketing', () => {
  it('places snapshots in correct (Mo-first dow, 24h hour) cells', () => {
    // 2026-05-13 is a Wednesday → dow index 2 (Mo=0, Tu=1, We=2)
    const sn: PriceSnapshot[] = [
      { timestamp: '2026-05-13T10:00:00Z', price: 1.700 },
      { timestamp: '2026-05-13T10:00:00Z', price: 1.800 }, // same cell
      { timestamp: '2026-05-13T11:00:00Z', price: 2.000 }, // adjacent hour
    ];
    const r = buildBestTimeHeatmap(sn);
    const we10 = r.cells[2]?.[10];
    const we11 = r.cells[2]?.[11];
    expect(we10?.count).toBe(2);
    expect(we10?.avgPrice).toBeCloseTo(1.75);
    expect(we11?.count).toBe(1);
    expect(we11?.avgPrice).toBeCloseTo(2.0);
  });

  it('Sunday maps to Mo-first dow=6 (not 0)', () => {
    // 2026-05-17 is Sunday in UTC
    const sn: PriceSnapshot[] = [
      { timestamp: '2026-05-17T12:00:00Z', price: 1.5 },
    ];
    const r = buildBestTimeHeatmap(sn);
    expect(r.cells[6]?.[12]?.count).toBe(1);
    expect(r.cells[0]?.[12]?.count).toBe(0);
  });
});

describe('buildBestTimeHeatmap — best/worst detection', () => {
  it('returns the single cheapest cell as bestCell', () => {
    const sn: PriceSnapshot[] = [
      { timestamp: '2026-05-13T06:00:00Z', price: 1.5 }, // cheapest
      { timestamp: '2026-05-13T18:00:00Z', price: 2.0 }, // priciest
      { timestamp: '2026-05-14T10:00:00Z', price: 1.8 },
    ];
    const r = buildBestTimeHeatmap(sn);
    expect(r.bestCell?.avgPrice).toBeCloseTo(1.5);
    expect(r.bestCell?.dayOfWeek).toBe(2); // Wednesday
    expect(r.bestCell?.hour).toBe(6);
    expect(r.worstCell?.avgPrice).toBeCloseTo(2.0);
    expect(r.worstCell?.hour).toBe(18);
  });

  it('best ≤ worst by definition (multi-day series)', () => {
    const sn: PriceSnapshot[] = [];
    for (let day = 0; day < 14; day++) {
      for (let h = 0; h < 24; h++) {
        sn.push({
          timestamp: new Date(Date.UTC(2026, 4, 1 + day, h)).toISOString(),
          price: 1.7 + Math.sin(h / 24 * 2 * Math.PI) * 0.05,
        });
      }
    }
    const r = buildBestTimeHeatmap(sn);
    expect(r.bestCell!.avgPrice!).toBeLessThanOrEqual(r.worstCell!.avgPrice!);
  });
});

describe('buildBestTimeHeatmap — confidence', () => {
  it('high confidence (>0.5) for dense uniform coverage', () => {
    const sn: PriceSnapshot[] = [];
    // 14 days × 24 hours × 5 samples/hour = 1680 snapshots,
    // covering every cell with high density
    for (let day = 0; day < 14; day++) {
      for (let h = 0; h < 24; h++) {
        for (let k = 0; k < 5; k++) {
          sn.push({
            timestamp: new Date(Date.UTC(2026, 4, 1 + day, h, k * 10)).toISOString(),
            price: 1.7,
          });
        }
      }
    }
    const r = buildBestTimeHeatmap(sn);
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('low confidence (<0.4) when coverage is sparse', () => {
    // Only 5 snapshots → covers at most 5 cells out of 168
    const sn: PriceSnapshot[] = [
      { timestamp: '2026-05-13T10:00:00Z', price: 1.7 },
      { timestamp: '2026-05-13T11:00:00Z', price: 1.7 },
      { timestamp: '2026-05-13T12:00:00Z', price: 1.7 },
      { timestamp: '2026-05-13T13:00:00Z', price: 1.7 },
      { timestamp: '2026-05-13T14:00:00Z', price: 1.7 },
    ];
    const r = buildBestTimeHeatmap(sn);
    expect(r.confidence).toBeLessThan(0.4);
  });

  it('confidence stays in [0, 1]', () => {
    const r = buildBestTimeHeatmap([
      { timestamp: '2026-05-13T10:00:00Z', price: 1.7 },
    ]);
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});

describe('buildBestTimeHeatmap — globalMean', () => {
  it('matches the arithmetic mean of all snapshots', () => {
    const sn: PriceSnapshot[] = [
      { timestamp: '2026-05-13T10:00:00Z', price: 1.5 },
      { timestamp: '2026-05-13T11:00:00Z', price: 2.0 },
      { timestamp: '2026-05-13T12:00:00Z', price: 1.6 },
    ];
    const r = buildBestTimeHeatmap(sn);
    expect(r.globalMean).toBeCloseTo((1.5 + 2.0 + 1.6) / 3, 2);
  });
});
