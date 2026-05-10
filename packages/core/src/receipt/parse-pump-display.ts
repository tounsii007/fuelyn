// ============================================================
// Pump-Display OCR Parser
//
// Sister-module to parse-receipt.ts, but tuned for the very
// different visual structure of a fuel-pump display:
//
//   * Big LED-style digits, often with a tiny superscript ⁹
//     for the third decimal: 1.74⁹  or  1.74 9
//   * Fuel grade label always nearby: "Super E10", "Diesel",
//     "Super E5", "Super 95", "Super 98".
//   * No transaction total, no station brand, no date.
//
// We export a single parsePumpDisplay() that returns a
// ParsedPumpDisplay record consumed by the photo-verification
// flow on the price-report form. Pure / deterministic; the
// Tesseract.js call lives in the web layer.
// ============================================================

export interface ParsedPumpDisplay {
  /** Price in €/L, or null if not parsable. */
  pricePerLiter: number | null;
  /** Fuel type if visible on the display, otherwise null. */
  fuelType: 'diesel' | 'e5' | 'e10' | null;
  /** All raw price-like strings the regex matched, for diagnostics. */
  rawCandidates: string[];
  /** 0..1 — how complete + how confident the extraction is. */
  confidence: number;
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

/**
 * The pump display puts the third decimal in a smaller font;
 * Tesseract typically OCRs that as either:
 *   "1.749"   (joined)
 *   "1.74 9"  (a space)
 *   "1.74⁹"   (superscript glyph)
 *   "1,74⁹"   (German comma + superscript)
 *
 * Normalise by stripping U+2070-U+2079 superscripts back to ASCII
 * digits and collapsing the inter-digit space.
 */
const SUPERSCRIPT_DIGITS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

function normalize(text: string): string {
  // 1) Replace each superscript glyph with its plain digit.
  let out = text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (c) => SUPERSCRIPT_DIGITS[c] ?? c);
  // 2) Glue a stray third-decimal digit back: "1.74 9" → "1.749", but
  //    don't merge "1.74 €" — only when the trailing token is a single digit.
  out = out.replace(/(\d[.,]\d{2})\s+(\d)(?!\d)/g, '$1$2');
  return out;
}

function toEur(raw: string): number | null {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n >= 0.5 && n <= 3.99 ? n : null;
}

// ---------------------------------------------------------------
// Field extractors
// ---------------------------------------------------------------

export function extractPumpPrice(rawText: string): { value: number | null; raw: string[] } {
  const text = normalize(rawText);
  const candidates: string[] = [];

  // First-priority pattern: "1.749 EUR/L" / "1,749 €/L"
  const re1 = /(\d[.,]\d{2,3})\s*(?:€|EUR|EURO)\s*\/?\s*L\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re1.exec(text)) !== null) candidates.push(m[1]!);

  if (candidates.length === 0) {
    // Second-priority: bare "1.749" with NO trailing letter / digit context
    // — matches the giant LED digits on the display.
    const re2 = /\b(\d[.,]\d{3})\b/g;
    while ((m = re2.exec(text)) !== null) candidates.push(m[1]!);
  }

  if (candidates.length === 0) {
    // Last-resort: 2-decimal price, accept range 0.50..3.99 €/L.
    const re3 = /\b(\d[.,]\d{2})\b/g;
    while ((m = re3.exec(text)) !== null) candidates.push(m[1]!);
  }

  for (const c of candidates) {
    const v = toEur(c);
    if (v != null) return { value: v, raw: candidates };
  }
  return { value: null, raw: candidates };
}

export function extractPumpFuelType(rawText: string): 'diesel' | 'e5' | 'e10' | null {
  const t = rawText.toLowerCase();
  // E10 wins over E5 wins over Diesel — order matters because
  // "Super E10" contains "Super" which also matches E5.
  if (/\be\s*10\b/.test(t) || /super\s*e\s*10/i.test(rawText)) return 'e10';
  if (/\be\s*5\b/.test(t) || /super\s*e\s*5/i.test(rawText)) return 'e5';
  if (/super\s*95\b/.test(t) || /super\s*98\b/.test(t)) return 'e5';
  if (/\bdiesel\b/.test(t)) return 'diesel';
  return null;
}

// ---------------------------------------------------------------
// Top-level
// ---------------------------------------------------------------

export function parsePumpDisplay(rawText: string): ParsedPumpDisplay {
  const price = extractPumpPrice(rawText);
  const fuelType = extractPumpFuelType(rawText);
  // Confidence: 0.7 when only price, 1.0 when price + fuel type, 0.4
  // when only fuel type, 0 when nothing.
  let confidence = 0;
  if (price.value != null && fuelType) confidence = 1;
  else if (price.value != null) confidence = 0.7;
  else if (fuelType) confidence = 0.4;
  return {
    pricePerLiter: price.value,
    fuelType,
    rawCandidates: price.raw,
    confidence,
  };
}
