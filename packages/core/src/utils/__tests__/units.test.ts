// ============================================================
// Unit-conversion tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  unitSystemForLocale,
  kmToMiles,
  milesToKm,
  litresToGallons,
  gallonsToLitres,
  eurPerLiterToUsdPerGallon,
  lPer100kmToMpg,
  mpgToLPer100km,
  formatDistanceLocalized,
  formatPriceLocalized,
  formatConsumptionLocalized,
} from '../units';

describe('unitSystemForLocale', () => {
  it('returns imperial for en-US', () => {
    expect(unitSystemForLocale('en-US')).toBe('imperial');
    expect(unitSystemForLocale('en-us')).toBe('imperial');
  });

  it('returns metric for everything else', () => {
    for (const loc of ['de', 'en', 'fr', 'de-DE', 'en-GB']) {
      expect(unitSystemForLocale(loc)).toBe('metric');
    }
  });
});

describe('distance', () => {
  it('1 mile = 1.609344 km exactly', () => {
    expect(milesToKm(1)).toBeCloseTo(1.609344, 6);
  });

  it('round-trip km → miles → km is identity', () => {
    expect(milesToKm(kmToMiles(100))).toBeCloseTo(100, 9);
  });

  it('formats km in metric locale', () => {
    expect(formatDistanceLocalized(2.4, 'de')).toBe('2.4 km');
    expect(formatDistanceLocalized(15, 'fr')).toBe('15 km');
  });

  it('formats miles in en-US', () => {
    expect(formatDistanceLocalized(2.4, 'en-US')).toMatch(/mi/);
    // 2.4 km = ~1.5 mi
    expect(formatDistanceLocalized(2.4, 'en-US')).toContain('1.5');
  });
});

describe('volume', () => {
  it('1 US gal = 3.785411784 L exactly', () => {
    expect(gallonsToLitres(1)).toBeCloseTo(3.785411784, 9);
  });

  it('round-trip is identity', () => {
    expect(gallonsToLitres(litresToGallons(50))).toBeCloseTo(50, 9);
  });
});

describe('price', () => {
  it('1.74 €/L → ~7.10 $/gal at 1.08 USD/EUR', () => {
    // 1.74 × 1.08 × 3.785 ≈ 7.114
    expect(eurPerLiterToUsdPerGallon(1.74, 1.08)).toBeCloseTo(7.11, 1);
  });

  it('formats €/L for metric locales with locale-correct separator', () => {
    expect(formatPriceLocalized(1.749, 'de')).toBe('1,749 €/L');
    expect(formatPriceLocalized(1.749, 'fr')).toBe('1,749 €/L');
    expect(formatPriceLocalized(1.749, 'en')).toBe('1.749 €/L');
  });

  it('formats $/gal for en-US', () => {
    const out = formatPriceLocalized(1.749, 'en-US', 1.08);
    expect(out).toMatch(/^\$\d+\.\d{2}\/gal$/);
  });
});

describe('consumption', () => {
  it('5 L/100km ≈ 47 MPG', () => {
    expect(lPer100kmToMpg(5)).toBeCloseTo(47.04, 1);
  });

  it('round-trip is identity', () => {
    expect(mpgToLPer100km(lPer100kmToMpg(7.5))).toBeCloseTo(7.5, 6);
  });

  it('non-positive inputs degrade gracefully', () => {
    expect(lPer100kmToMpg(0)).toBe(0);
    expect(lPer100kmToMpg(-1)).toBe(0);
    expect(mpgToLPer100km(Number.NaN)).toBe(0);
  });

  it('formats L/100km in metric locales', () => {
    expect(formatConsumptionLocalized(6.5, 'de')).toBe('6.5 L/100km');
  });

  it('formats MPG in en-US', () => {
    expect(formatConsumptionLocalized(6.5, 'en-US')).toMatch(/mpg/);
  });
});
