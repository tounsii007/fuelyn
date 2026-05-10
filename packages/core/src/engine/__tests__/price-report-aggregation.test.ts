// ============================================================
// Price-report aggregation engine tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import { aggregateReports } from '../price-report-aggregation';

const NOW = new Date('2026-05-10T12:00:00Z');

function rep(price: number, conf: number, hoursAgo: number = 1, photoVerified = false) {
  return {
    price,
    confidence: conf,
    observedAt: new Date(NOW.getTime() - hoursAgo * 3600 * 1000).toISOString(),
    photoVerified,
  };
}

describe('aggregateReports — empty / window edges', () => {
  it('keeps upstream when no reports', () => {
    const r = aggregateReports([], { now: NOW });
    expect(r.decision).toBe('keep-upstream');
    expect(r.canonicalPrice).toBeNull();
  });

  it('drops reports outside the window', () => {
    const r = aggregateReports([rep(1.5, 0.8, 24)], { now: NOW, windowHours: 6 });
    expect(r.decision).toBe('keep-upstream');
    expect(r.windowCount).toBe(0);
  });

  it('keeps reports at the boundary', () => {
    const r = aggregateReports([rep(1.5, 0.8, 5.99)], { now: NOW, windowHours: 6 });
    expect(r.windowCount).toBe(1);
  });
});

describe('aggregateReports — accept-canonical', () => {
  it('strong consensus (3 minor-correction reports + photo) accepts', () => {
    const reports = [
      rep(1.74, 0.75, 1),
      rep(1.74, 0.75, 1),
      rep(1.74, 0.95, 1, true), // photo-verified, +50% weight
    ];
    const r = aggregateReports(reports, { now: NOW });
    expect(r.decision).toBe('accept-canonical');
    expect(r.canonicalPrice).toBeCloseTo(1.74, 3);
    expect(r.totalWeight).toBeGreaterThanOrEqual(1.5);
    expect(r.stddevEurPerL).toBeLessThan(0.04);
  });

  it('photo-verified bonus is applied', () => {
    const noPhoto = aggregateReports(
      [rep(1.74, 0.75), rep(1.74, 0.75)], { now: NOW },
    );
    const withPhoto = aggregateReports(
      [rep(1.74, 0.75), rep(1.74, 0.75, 1, true)], { now: NOW },
    );
    expect(withPhoto.totalWeight).toBeGreaterThan(noPhoto.totalWeight);
  });
});

describe('aggregateReports — flag-for-review', () => {
  it('moderate weight (one minor-correction report) flags', () => {
    const r = aggregateReports([rep(1.74, 0.75)], { now: NOW });
    expect(r.decision).toBe('flag-for-review');
  });

  it('disagreement (high stddev) flags even at high weight', () => {
    const reports = [
      rep(1.74, 0.95),
      rep(1.74, 0.95),
      rep(1.85, 0.95), // outlier
    ];
    const r = aggregateReports(reports, { now: NOW });
    expect(r.decision).toBe('flag-for-review');
    expect(r.stddevEurPerL).toBeGreaterThan(0.04);
  });
});

describe('aggregateReports — keep-upstream', () => {
  it('single suspicious-confidence report stays under review threshold', () => {
    const r = aggregateReports([rep(1.74, 0.2)], { now: NOW });
    expect(r.decision).toBe('keep-upstream');
  });

  it('zero-confidence reports are dropped', () => {
    const r = aggregateReports([{ price: 1.74, confidence: 0, observedAt: NOW.toISOString(), photoVerified: false }], { now: NOW });
    expect(r.windowCount).toBe(0);
  });
});

describe('aggregateReports — canonical price selection', () => {
  it('uses the weighted median, not the mean', () => {
    // Mean would be skewed by the outlier; median picks the middle.
    const reports = [
      rep(1.74, 0.95),
      rep(1.74, 0.95),
      rep(1.74, 0.95),
      rep(1.50, 0.95), // distant outlier
    ];
    const r = aggregateReports(reports, { now: NOW });
    // High σ → flag for review, but the canonical price stays
    // around the median, NOT the mean (~1.68).
    expect(r.canonicalPrice).toBeCloseTo(1.74, 2);
  });

  it('respects a custom acceptance threshold', () => {
    const r = aggregateReports([rep(1.74, 0.75)], {
      now: NOW,
      acceptanceThreshold: 0.5,
    });
    expect(r.decision).toBe('accept-canonical');
  });
});
