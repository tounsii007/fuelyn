// ============================================================
// Pump-display OCR parser tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  parsePumpDisplay,
  extractPumpPrice,
  extractPumpFuelType,
} from '../parse-pump-display';

describe('extractPumpPrice', () => {
  it('handles superscript notation (1.74⁹)', () => {
    const r = extractPumpPrice('1.74⁹');
    expect(r.value).toBeCloseTo(1.749, 3);
  });

  it('handles space-separated third decimal (1.74 9)', () => {
    const r = extractPumpPrice('Super E10 1.74 9');
    expect(r.value).toBeCloseTo(1.749, 3);
  });

  it('handles German comma (1,749)', () => {
    const r = extractPumpPrice('Diesel 1,749');
    expect(r.value).toBeCloseTo(1.749, 3);
  });

  it('handles "EUR/L" suffix', () => {
    const r = extractPumpPrice('1.749 EUR/L');
    expect(r.value).toBeCloseTo(1.749, 3);
  });

  it('rejects implausible prices', () => {
    expect(extractPumpPrice('17.49').value).toBeNull();
    expect(extractPumpPrice('0.1').value).toBeNull();
  });

  it('returns the first plausible candidate when several are present', () => {
    // OCR sometimes pulls in the pump number ("3 1.749") — engine
    // should still find 1.749.
    const r = extractPumpPrice('Pump 3   1.74 9   EUR/L');
    expect(r.value).toBeCloseTo(1.749, 3);
  });

  it('falls back to 2-decimal price when 3-decimal not found', () => {
    const r = extractPumpPrice('Diesel 1.74 €/L');
    expect(r.value).toBeCloseTo(1.74, 2);
  });

  it('handles spaces around comma decimal (1, 749)', () => {
    // Some receipts have weird spacing; this is the line we
    // explicitly DO NOT fix — ambiguous between thousands sep
    // and decimal sep — engine should fall back to the 2-decimal
    // form OR return null. Test the safer outcome:
    const r = extractPumpPrice('1, 749');
    // We accept either: a 3-decimal hit on "1, 749" is risky, so
    // null is also acceptable. The important contract is "no
    // implausibly small or large value gets through".
    expect(r.value === null || (r.value >= 0.5 && r.value <= 3.99)).toBe(true);
  });
});

describe('extractPumpFuelType', () => {
  it('detects Super E10', () => {
    expect(extractPumpFuelType('Super E10')).toBe('e10');
  });

  it('detects Super E5', () => {
    expect(extractPumpFuelType('Super E5')).toBe('e5');
  });

  it('detects "Super 95" / "Super 98" as E5', () => {
    expect(extractPumpFuelType('Super 95')).toBe('e5');
    expect(extractPumpFuelType('Super 98')).toBe('e5');
  });

  it('detects Diesel', () => {
    expect(extractPumpFuelType('Diesel B7')).toBe('diesel');
  });

  it('prefers E10 over E5 when both tokens appear', () => {
    expect(extractPumpFuelType('Super E10 (Super E5 disabled)')).toBe('e10');
  });

  it('returns null when no fuel keyword present', () => {
    expect(extractPumpFuelType('1.74 9 EUR/L')).toBeNull();
  });
});

describe('parsePumpDisplay — integration', () => {
  it('confidence 1.0 when price + fuel type both detected', () => {
    const r = parsePumpDisplay('Super E10\n1.74⁹ EUR/L');
    expect(r.pricePerLiter).toBeCloseTo(1.749, 3);
    expect(r.fuelType).toBe('e10');
    expect(r.confidence).toBe(1);
  });

  it('confidence 0.7 when only price detected', () => {
    const r = parsePumpDisplay('1.74⁹ EUR/L');
    expect(r.pricePerLiter).toBeCloseTo(1.749, 3);
    expect(r.fuelType).toBeNull();
    expect(r.confidence).toBe(0.7);
  });

  it('confidence 0.4 when only fuel type detected', () => {
    const r = parsePumpDisplay('Super E10');
    expect(r.pricePerLiter).toBeNull();
    expect(r.fuelType).toBe('e10');
    expect(r.confidence).toBe(0.4);
  });

  it('confidence 0 when nothing parses', () => {
    const r = parsePumpDisplay('---');
    expect(r.confidence).toBe(0);
  });

  it('handles a noisy real-world OCR string', () => {
    const ocr = `
      Super E10
      Pumpe 3
      1.74⁹
      EUR/L
      Liter: 38.42
    `;
    const r = parsePumpDisplay(ocr);
    expect(r.pricePerLiter).toBeCloseTo(1.749, 3);
    expect(r.fuelType).toBe('e10');
  });
});
