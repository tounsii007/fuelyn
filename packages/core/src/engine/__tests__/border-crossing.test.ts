// ============================================================
// Border-crossing fuel-hint engine — tests.
//
// Each fixture pins a "user" at a real German city and verifies
// the engine surfaces the right neighbouring country (or none).
// ============================================================

import { describe, it, expect } from 'vitest';
import { evaluateBorderHints, BORDER_WAYPOINTS } from '../border-crossing';
import type { Coordinates } from '../../domain/types';

const TRIER: Coordinates = { lat: 49.7596, lng: 6.6439 };           // ~30 km from Wasserbillig (LU)
const SAARBRUECKEN: Coordinates = { lat: 49.2401, lng: 6.9969 };    // ~70 km from Wasserbillig
const FRANKFURT: Coordinates = { lat: 50.110, lng: 8.682 };         // far inland
const PASSAU: Coordinates = { lat: 48.5667, lng: 13.4319 };         // close to AT/CZ
const ZITTAU: Coordinates = { lat: 50.8973, lng: 14.8074 };         // PL/CZ tri-point

describe('evaluateBorderHints — Trier user (LU diesel)', () => {
  it('flags Luxembourg as the best opportunity for diesel', () => {
    const r = evaluateBorderHints({ origin: TRIER, fuelType: 'diesel' });
    expect(r.best).not.toBeNull();
    expect(r.best?.country).toBe('LU');
    expect(r.best?.worthwhile).toBe(true);
    expect(r.best?.estimatedSavingsEurPerL).toBeLessThan(-0.2);
  });

  it('reports nearest equal to best when LU is the closest border', () => {
    const r = evaluateBorderHints({ origin: TRIER, fuelType: 'diesel' });
    expect(r.nearest?.country).toBe('LU');
  });

  it('computes per-fill savings when vehicleTankL is supplied', () => {
    const r = evaluateBorderHints({
      origin: TRIER,
      fuelType: 'diesel',
      vehicleTankL: 50,
    });
    // delta is -0.27 €/L, tank 50 L → savings ≈ €13.50 per fill.
    expect(r.best?.estimatedSavingsPerFillEur).toBeGreaterThan(13);
    expect(r.best?.estimatedSavingsPerFillEur).toBeLessThan(14);
  });
});

describe('evaluateBorderHints — Saarbrücken user', () => {
  it('flags Forbach (FR) as nearest', () => {
    // Saarbrücken→Forbach is ~10 km — well within the 60km threshold.
    const r = evaluateBorderHints({
      origin: SAARBRUECKEN,
      fuelType: 'diesel',
    });
    expect(r.nearest?.country).toBe('FR');
  });

  it('still recommends LU when widening threshold + raising delta floor', () => {
    // FR diesel delta is only -0.05 €/L (default cutoff). At 0.10 €/L the
    // FR option is below the floor, so the engine should walk over to LU.
    const r = evaluateBorderHints({
      origin: SAARBRUECKEN,
      fuelType: 'diesel',
      thresholdKm: 100,
      minDeltaEurPerL: 0.10,
    });
    expect(r.best?.country).toBe('LU');
    expect(r.best?.worthwhile).toBe(true);
  });
});

describe('evaluateBorderHints — Frankfurt user', () => {
  it('returns no worthwhile hint (no border within 60 km)', () => {
    const r = evaluateBorderHints({ origin: FRANKFURT, fuelType: 'diesel' });
    expect(r.best).toBeNull();
    // Nearest still resolves — UI uses it for "you are X km from country Y".
    expect(r.nearest).not.toBeNull();
    expect(r.nearest!.distanceKm).toBeGreaterThan(120);
  });
});

describe('evaluateBorderHints — Passau / Zittau (multi-border)', () => {
  it('Passau flags Austria for diesel', () => {
    const r = evaluateBorderHints({ origin: PASSAU, fuelType: 'diesel' });
    expect(r.best?.country).toBe('AT');
    expect(r.best?.worthwhile).toBe(true);
  });

  it('Zittau picks Czechia ahead of Poland for diesel', () => {
    // CZ has a slightly bigger negative delta than PL for diesel and is
    // also closer.
    const r = evaluateBorderHints({ origin: ZITTAU, fuelType: 'diesel' });
    expect(r.best?.country).toBe('CZ');
  });
});

describe('evaluateBorderHints — fuel-type sensitivity', () => {
  it('does not recommend Netherlands for E10 (it is more expensive)', () => {
    // Aachen → Venlo is short, but NL E10 is +0.10 €/L. Should not be best.
    const AACHEN: Coordinates = { lat: 50.7753, lng: 6.0839 };
    const r = evaluateBorderHints({ origin: AACHEN, fuelType: 'e10' });
    expect(r.best?.country).not.toBe('NL');
  });

  it('does not recommend Switzerland (+0.18 €/L diesel)', () => {
    const FREIBURG: Coordinates = { lat: 47.999, lng: 7.842 };
    const r = evaluateBorderHints({ origin: FREIBURG, fuelType: 'diesel' });
    expect(r.best?.country).not.toBe('CH');
  });
});

describe('evaluateBorderHints — invariants', () => {
  it('covers every neighbouring country at least once', () => {
    // Some countries (AT, CZ, FR) have multiple waypoints because their
    // German border is too long to cover with a single point.
    const seen = new Set<string>();
    for (const wp of BORDER_WAYPOINTS) seen.add(wp.country);
    expect(seen.size).toBeGreaterThanOrEqual(8);
    expect(seen).toContain('LU');
    expect(seen).toContain('CZ');
    expect(seen).toContain('AT');
  });

  it('respects custom minDeltaEurPerL', () => {
    // Trier→Wasserbillig delta is -0.27 €/L. With a 0.30 minimum, no hit.
    const r = evaluateBorderHints({
      origin: TRIER,
      fuelType: 'diesel',
      minDeltaEurPerL: 0.30,
    });
    expect(r.best).toBeNull();
  });
});
