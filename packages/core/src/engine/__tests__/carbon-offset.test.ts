// ============================================================
// Carbon-offset engine tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import { recommendOffsets, OFFSET_PROVIDERS } from '../carbon-offset';

describe('recommendOffsets — happy path', () => {
  it('produces 6 sorted options for a real-world CO₂ amount', () => {
    const r = recommendOffsets(500); // 500 kg CO₂
    expect(r).not.toBeNull();
    expect(r!.all).toHaveLength(OFFSET_PROVIDERS.length);
    // sorted ascending by totalEur
    for (let i = 1; i < r!.all.length; i++) {
      expect(r!.all[i]!.totalEur).toBeGreaterThanOrEqual(r!.all[i - 1]!.totalEur);
    }
  });

  it('cheapest is the lowest €/ton provider', () => {
    const r = recommendOffsets(1000);
    const minRate = Math.min(...OFFSET_PROVIDERS.map((p) => p.eurPerTon));
    expect(r!.cheapest.provider.eurPerTon).toBe(minRate);
  });

  it('highestPermanence picks DAC (Climeworks)', () => {
    const r = recommendOffsets(1000);
    expect(r!.highestPermanence.provider.projectType).toBe('direct-air-capture');
    expect(r!.highestPermanence.provider.id).toBe('climeworks');
  });

  it('totalEur scales linearly with co2Kg', () => {
    const r1 = recommendOffsets(1000);
    const r2 = recommendOffsets(2000);
    expect(r2!.cheapest.totalEur).toBeCloseTo(r1!.cheapest.totalEur * 2, 2);
  });

  it('Climeworks at 1 ton = 850 €', () => {
    const r = recommendOffsets(1000);
    const climeworks = r!.all.find((o) => o.provider.id === 'climeworks');
    expect(climeworks?.totalEur).toBeCloseTo(850, 2);
  });

  it('atmosfair at 0.5 ton = 11.50 €', () => {
    const r = recommendOffsets(500);
    const atmosfair = r!.all.find((o) => o.provider.id === 'atmosfair');
    expect(atmosfair?.totalEur).toBeCloseTo(11.50, 2);
  });
});

describe('recommendOffsets — edge cases', () => {
  it('returns null for zero CO₂', () => {
    expect(recommendOffsets(0)).toBeNull();
  });

  it('returns null for negative CO₂', () => {
    expect(recommendOffsets(-100)).toBeNull();
  });

  it('returns null for non-finite CO₂', () => {
    expect(recommendOffsets(Number.NaN)).toBeNull();
  });

  it('returns null for an empty catalogue', () => {
    expect(recommendOffsets(500, [])).toBeNull();
  });

  it('respects an injected catalogue', () => {
    const fakeCatalogue = [{
      id: 'fake', name: 'Fake', countryCode: 'DE',
      projectType: 'reforestation' as const, certification: 'gold-standard' as const,
      eurPerTon: 10, url: 'https://example.com',
      lastReviewed: '2026-01-01', descDe: '',
    }];
    const r = recommendOffsets(1000, fakeCatalogue);
    expect(r!.all).toHaveLength(1);
    expect(r!.all[0]?.totalEur).toBe(10);
  });
});

describe('OFFSET_PROVIDERS catalogue invariants', () => {
  it('every provider has positive €/ton', () => {
    for (const p of OFFSET_PROVIDERS) {
      expect(p.eurPerTon).toBeGreaterThan(0);
    }
  });

  it('every provider has a valid URL', () => {
    for (const p of OFFSET_PROVIDERS) {
      expect(() => new URL(p.url)).not.toThrow();
    }
  });

  it('contains at least one DAC provider', () => {
    expect(OFFSET_PROVIDERS.some((p) => p.projectType === 'direct-air-capture')).toBe(true);
  });

  it('contains at least one Gold-Standard certified provider', () => {
    expect(OFFSET_PROVIDERS.some((p) => p.certification === 'gold-standard')).toBe(true);
  });

  it('lastReviewed is parseable for every entry', () => {
    for (const p of OFFSET_PROVIDERS) {
      expect(Number.isNaN(new Date(p.lastReviewed).getTime())).toBe(false);
    }
  });
});
