// ============================================================
// Anonymous Price Report — engine tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import { validatePriceReport, MIN_PLAUSIBLE_PRICE, MAX_PLAUSIBLE_PRICE } from '../price-report';

describe('validatePriceReport — happy path', () => {
  it('accepts a normal report', () => {
    const r = validatePriceReport({
      stationId: 'abc-123',
      fuelType: 'diesel',
      price: 1.749,
    });
    expect(r.ok).toBe(true);
    expect(r.record?.price).toBe(1.749);
    expect(r.classification).toBe('no-known-price');
    expect(r.confidence).toBe(0.5);
  });

  it('rounds price to 3 decimals', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'e10',
      price: 1.7493333,
    });
    expect(r.record?.price).toBeCloseTo(1.749, 3);
  });

  it('defaults observedAt to now', () => {
    const t0 = Date.now();
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'e5',
      price: 1.79,
    });
    const t = new Date(r.record!.observedAt).getTime();
    expect(Math.abs(t - t0)).toBeLessThan(1000);
  });
});

describe('validatePriceReport — rejections', () => {
  it('rejects empty station ID', () => {
    const r = validatePriceReport({
      stationId: '',
      fuelType: 'e10',
      price: 1.74,
    });
    expect(r.ok).toBe(false);
    expect(r.rejection).toBe('station-id-empty');
  });

  it('rejects whitespace-only station ID', () => {
    const r = validatePriceReport({
      stationId: '  ',
      fuelType: 'e10',
      price: 1.74,
    });
    expect(r.ok).toBe(false);
    expect(r.rejection).toBe('station-id-empty');
  });

  it('rejects invalid fuel type', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fuelType: 'lpg' as any,
      price: 1.74,
    });
    expect(r.ok).toBe(false);
    expect(r.rejection).toBe('fuel-type-invalid');
  });

  it('rejects NaN price', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'diesel',
      price: Number.NaN,
    });
    expect(r.ok).toBe(false);
    expect(r.rejection).toBe('price-not-finite');
  });

  it('rejects Infinity', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'diesel',
      price: Number.POSITIVE_INFINITY,
    });
    expect(r.ok).toBe(false);
    expect(r.rejection).toBe('price-not-finite');
  });

  it('rejects price below 0.50 €/L', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'diesel',
      price: 0.49,
    });
    expect(r.ok).toBe(false);
    expect(r.rejection).toBe('price-out-of-range');
  });

  it('rejects price above 3.99 €/L', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'diesel',
      price: 4.0,
    });
    expect(r.ok).toBe(false);
    expect(r.rejection).toBe('price-out-of-range');
  });

  it('rejects malformed observedAt', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'e10',
      price: 1.74,
      observedAt: 'not-a-date',
    });
    expect(r.ok).toBe(false);
    expect(r.rejection).toBe('observed-at-invalid');
  });
});

describe('validatePriceReport — classification with knownPrice', () => {
  it('matches-known when within 0.5 ct', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'e10',
      price: 1.749,
      knownPrice: 1.749,
    });
    expect(r.classification).toBe('matches-known');
    expect(r.confidence).toBe(0.95);
    expect(r.deltaEurPerL).toBe(0);
  });

  it('minor-correction at ~2 ct off', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'e10',
      price: 1.769,
      knownPrice: 1.749,
    });
    expect(r.classification).toBe('minor-correction');
    expect(r.confidence).toBe(0.75);
    expect(r.deltaEurPerL).toBeCloseTo(0.02, 2);
  });

  it('major-correction at ~5 ct off', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'e10',
      price: 1.799,
      knownPrice: 1.749,
    });
    expect(r.classification).toBe('major-correction');
    expect(r.confidence).toBe(0.55);
  });

  it('suspicious at > 10 ct off', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'e10',
      price: 1.500, // -25 ct vs known
      knownPrice: 1.749,
    });
    expect(r.classification).toBe('suspicious');
    expect(r.confidence).toBe(0.2);
  });

  it('no-known-price classification when knownPrice is null', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'e10',
      price: 1.749,
      knownPrice: null,
    });
    expect(r.classification).toBe('no-known-price');
  });
});

describe('validatePriceReport — boundary conditions', () => {
  it('accepts exactly the lower bound', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'diesel',
      price: MIN_PLAUSIBLE_PRICE,
    });
    expect(r.ok).toBe(true);
  });

  it('accepts exactly the upper bound', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'diesel',
      price: MAX_PLAUSIBLE_PRICE,
    });
    expect(r.ok).toBe(true);
  });

  it('rejects MIN - epsilon', () => {
    const r = validatePriceReport({
      stationId: 'abc',
      fuelType: 'diesel',
      price: MIN_PLAUSIBLE_PRICE - 0.001,
    });
    expect(r.ok).toBe(false);
  });
});
