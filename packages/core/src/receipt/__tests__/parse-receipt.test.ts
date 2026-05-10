// ============================================================
// parseReceipt — receipt-OCR-text → structured fields tests.
//
// Covers the full extraction surface against synthetic but
// realistic receipt strings. Each German fuel chain has a
// slightly different layout, so we keep one test per common
// shape to guard against regressions when the regexes evolve.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  parseReceipt,
  extractDate,
  extractBrand,
  extractFuelType,
  extractLiters,
  extractPricePerLiter,
  extractTotal,
} from '../parse-receipt';

const FIXED_NOW = new Date('2026-05-13T12:00:00Z');

describe('extractDate', () => {
  it('parses German dot-separated dates', () => {
    expect(extractDate('Datum: 13.05.2026', FIXED_NOW)).toBe('2026-05-13');
  });

  it('handles 2-digit year (assumes 20YY)', () => {
    expect(extractDate('13.05.26', FIXED_NOW)).toBe('2026-05-13');
  });

  it('parses ISO yyyy-mm-dd', () => {
    expect(extractDate('Date 2026-05-13 12:30', FIXED_NOW)).toBe('2026-05-13');
  });

  it('parses slash-separated dates', () => {
    expect(extractDate('13/05/2026', FIXED_NOW)).toBe('2026-05-13');
  });

  it('zero-pads single-digit days/months', () => {
    expect(extractDate('3.5.2026', FIXED_NOW)).toBe('2026-05-03');
  });

  it('rejects implausibly old dates (>10 years back)', () => {
    expect(extractDate('13.05.2010', FIXED_NOW)).toBeNull();
  });

  it('rejects future dates beyond next year', () => {
    expect(extractDate('13.05.2030', FIXED_NOW)).toBeNull();
  });

  it('rejects invalid month/day', () => {
    expect(extractDate('32.13.2026', FIXED_NOW)).toBeNull();
  });

  it('returns null when no date is present', () => {
    expect(extractDate('Aral Tankstelle, Diesel 1,799 €/L', FIXED_NOW)).toBeNull();
  });
});

describe('extractBrand', () => {
  it.each([
    ['Aral Tankstelle Frankfurt', 'Aral'],
    ['SHELL DEUTSCHLAND GMBH', 'Shell'],
    ['Esso Bahnhofstr. 12', 'Esso'],
    ['JET Service-Station', 'Jet'],
    ['BP Tankstelle 12345', 'BP'],
  ])('detects %s', (input, expected) => {
    expect(extractBrand(input)).toBe(expected);
  });

  it('returns canonical casing even when receipt is all-caps', () => {
    expect(extractBrand('ARAL TANKSTELLE')).toBe('Aral');
  });

  it('returns null when no known brand matches', () => {
    expect(extractBrand('Kleine private Tanke GmbH')).toBeNull();
  });

  it('does NOT false-match substrings (Esso ≠ Espresso)', () => {
    expect(extractBrand('Espresso 2,50 €')).toBeNull();
  });
});

describe('extractFuelType', () => {
  it.each([
    ['Diesel 42,15 L', 'diesel'],
    ['DIESEL KRAFTSTOFF', 'diesel'],
    ['Super E10 1,799', 'e10'],
    ['Super E5 1,829', 'e5'],
    ['S95 Benzin', 'e5'],
    ['Super 95 1,829', 'e5'], // bare "Super" → e5 fallback
  ])('detects %s', (input, expected) => {
    expect(extractFuelType(input)).toBe(expected);
  });

  it('prefers E10 when both E5 and E10 mentioned (specificity wins)', () => {
    // Order in the regex chain: E10 checked before E5
    expect(extractFuelType('Super E10 (war zuvor E5)')).toBe('e10');
  });

  it('returns null when no fuel keyword present', () => {
    expect(extractFuelType('Aral Tankstelle Bahnhofstr.')).toBeNull();
  });
});

describe('extractLiters', () => {
  it('parses German decimal-comma format with L suffix', () => {
    expect(extractLiters('Menge: 42,15 L')).toBe(42.15);
  });

  it('parses dot-decimal with Liter suffix', () => {
    expect(extractLiters('42.15 Liter')).toBe(42.15);
  });

  it('handles single-digit liters', () => {
    expect(extractLiters('5,00 L')).toBe(5);
  });

  it('rejects implausibly small values (< 0.5 L)', () => {
    expect(extractLiters('0,3 L')).toBeNull();
  });

  it('rejects implausibly large values (> 500 L)', () => {
    expect(extractLiters('600,00 L')).toBeNull();
  });

  it('returns null when no liter pattern present', () => {
    expect(extractLiters('Diesel 1,799 €')).toBeNull();
  });
});

describe('extractPricePerLiter', () => {
  it('parses EUR/L prefix format', () => {
    expect(extractPricePerLiter('EUR/L 1,799')).toBeCloseTo(1.799);
  });

  it('parses Preis/L: format', () => {
    expect(extractPricePerLiter('Preis/L: 1,799')).toBeCloseTo(1.799);
  });

  it('parses suffix "1,799 €/L" format', () => {
    expect(extractPricePerLiter('Diesel 1,799 €/L Mengenrabatt')).toBeCloseTo(1.799);
  });

  it('rejects out-of-range prices', () => {
    expect(extractPricePerLiter('EUR/L 9,99')).toBeNull();
    expect(extractPricePerLiter('EUR/L 0,30')).toBeNull();
  });
});

describe('extractTotal', () => {
  it('finds Summe with EUR suffix', () => {
    expect(extractTotal('Summe: 75,82 EUR')).toBeCloseTo(75.82);
  });

  it('finds Gesamt without explicit currency', () => {
    expect(extractTotal('Gesamt 75,82')).toBeCloseTo(75.82);
  });

  it('finds Total / Zu zahlen / Endbetrag variants', () => {
    expect(extractTotal('Total: 75,82 €')).toBeCloseTo(75.82);
    expect(extractTotal('Zu zahlen 75,82')).toBeCloseTo(75.82);
    expect(extractTotal('Endbetrag 75,82 EUR')).toBeCloseTo(75.82);
  });

  it('returns null for implausibly small or large totals', () => {
    expect(extractTotal('Summe: 0,50 EUR')).toBeNull();
    expect(extractTotal('Summe: 5000,00 EUR')).toBeNull();
  });
});

describe('parseReceipt — full pipeline', () => {
  it('extracts every field from a realistic Aral diesel receipt', () => {
    const receipt = `
      ARAL Tankstelle 12345
      Bahnhofstr. 12
      35037 Marburg
      Datum: 13.05.2026  10:42
      Diesel
      Menge: 42,15 L
      EUR/L 1,799
      Summe: 75,83 EUR
      Vielen Dank
    `;
    const r = parseReceipt(receipt, FIXED_NOW);
    expect(r.date).toBe('2026-05-13');
    expect(r.stationBrand).toBe('Aral');
    expect(r.fuelType).toBe('diesel');
    expect(r.liters).toBeCloseTo(42.15);
    expect(r.pricePerLiter).toBeCloseTo(1.799);
    expect(r.totalCost).toBeCloseTo(75.83, 1);
    expect(r.confidence).toBe(1.0);
  });

  it('extracts fields from a Shell E10 receipt with cents notation', () => {
    const receipt = `
      Shell DEUTSCHLAND GMBH
      Hauptstraße 1, 60313 Frankfurt
      03.05.26  18:15
      Super E10
      35,50 L
      Preis/L: 1,729
      Total: 61,38 €
    `;
    const r = parseReceipt(receipt, FIXED_NOW);
    expect(r.date).toBe('2026-05-03');
    expect(r.stationBrand).toBe('Shell');
    expect(r.fuelType).toBe('e10');
    expect(r.liters).toBeCloseTo(35.5);
    expect(r.pricePerLiter).toBeCloseTo(1.729);
    expect(r.totalCost).toBeCloseTo(61.38, 1);
  });

  it('synthesizes total from liters × price when total is missing', () => {
    const receipt = `
      Esso 13.05.2026
      Diesel 40,00 L
      EUR/L 2,000
      [Beleg unleserlich, Summenfeld fehlt]
    `;
    const r = parseReceipt(receipt, FIXED_NOW);
    expect(r.liters).toBe(40);
    expect(r.pricePerLiter).toBe(2);
    expect(r.totalCost).toBe(80);
  });

  it('overrides OCR total with computed value when drift > 5 %', () => {
    // OCR misreads 75,83 as 95,83 (a "9" mistake). Computed = 75.81.
    const receipt = `
      Aral 13.05.2026 Diesel 42,15 L EUR/L 1,798 Summe: 95,83 EUR
    `;
    const r = parseReceipt(receipt, FIXED_NOW);
    // Computed: 42.15 × 1.798 = 75.7857 → 75.79 (rounded)
    expect(r.totalCost).toBeCloseTo(75.79, 1);
  });

  it('keeps OCR total when within 5% drift (e.g. coupon discount)', () => {
    // 42 × 1.799 = 75.56, OCR'd 74.50 = 1.4 % drift → keep OCR
    const receipt = `Aral 13.05.2026 Diesel 42,00 L EUR/L 1,799 Summe: 74,50 EUR`;
    const r = parseReceipt(receipt, FIXED_NOW);
    expect(r.totalCost).toBeCloseTo(74.5, 1);
  });

  it('confidence drops when fields are missing', () => {
    const partial = parseReceipt('Diesel 42,15 L', FIXED_NOW);
    // 1 of 6 fields filled → ~0.17 confidence
    expect(partial.fuelType).toBe('diesel');
    expect(partial.liters).toBeCloseTo(42.15);
    expect(partial.confidence).toBeGreaterThan(0);
    expect(partial.confidence).toBeLessThan(0.5);
  });

  it('handles a completely garbled receipt gracefully', () => {
    const garbage = 'xyz abc 123 ###';
    const r = parseReceipt(garbage, FIXED_NOW);
    expect(r.date).toBeNull();
    expect(r.stationBrand).toBeNull();
    expect(r.fuelType).toBeNull();
    expect(r.liters).toBeNull();
    expect(r.pricePerLiter).toBeNull();
    expect(r.totalCost).toBeNull();
    expect(r.confidence).toBe(0);
  });
});
