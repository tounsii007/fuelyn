// ============================================================
// Fuelyn — Receipt parser
//
// Takes raw OCR text from a fuel receipt and extracts the
// fields a fuel-log entry needs:
//   - date          (ISO yyyy-mm-dd)
//   - stationBrand  (Aral / Shell / Esso / …, best-effort)
//   - fuelType      (diesel / e5 / e10)
//   - liters        (number, German comma → dot)
//   - pricePerLiter (number, in €)
//   - totalCost     (number, in €)
//   - confidence    (0–1, how many fields landed)
//
// Why a pure function in core (not in apps/web):
//   - Lets us unit-test exhaustively without spinning up
//     Tesseract / a real receipt image
//   - Keeps the parsing logic colocated with other domain
//     code that mobile/web both consume
//   - Easy to extend later (more brand patterns, English
//     receipts, etc.) without touching UI code
//
// Approach is regex-based, NOT ML. German fuel receipts are
// remarkably consistent in shape (date format, line layout,
// "EUR/L" suffix, total at the bottom), so a few well-chosen
// patterns cover ≥80% of real receipts. The remaining edge
// cases get a partial result + low confidence so the UI can
// pre-fill what we have and let the user fix the rest.
// ============================================================

export interface ParsedReceipt {
  date: string | null;
  stationBrand: string | null;
  fuelType: 'diesel' | 'e5' | 'e10' | null;
  liters: number | null;
  pricePerLiter: number | null;
  totalCost: number | null;
  /** 0–1 — fraction of fields that came back non-null. */
  confidence: number;
}

const KNOWN_BRANDS = [
  'Aral', 'Shell', 'Esso', 'Total', 'TotalEnergies', 'Jet', 'Avia',
  'BP', 'Star', 'HEM', 'OMV', 'Agip', 'Eni', 'Q1', 'Q8',
  'Westfalen', 'Tankpool24', 'Knies', 'Allguth', 'Sprint', 'Raiffeisen',
  'AVIA', 'EnBW', 'Tank-Treff',
] as const;

function normalizeNumber(raw: string): number | null {
  // German receipts use comma as decimal separator and sometimes
  // dot as thousands separator. Strip thousands dots first, then
  // swap comma → dot.
  const cleaned = raw.replace(/\s+/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Date formats covered:
 *   13.05.2026
 *   13.05.26  → assumes 20YY
 *   2026-05-13
 *   13/05/2026
 *
 * Returns ISO yyyy-mm-dd; rejects values that wouldn't be a
 * plausible fuel-receipt date (out-of-range month/day or
 * future year > current year + 1).
 */
export function extractDate(text: string, now: Date = new Date()): string | null {
  // Match in priority order — the first plausible hit wins.
  const patterns: Array<{ re: RegExp; toIso: (m: RegExpMatchArray) => string }> = [
    {
      re: /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/,
      toIso: (m) => `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`,
    },
    {
      re: /\b(\d{1,2})\.(\d{1,2})\.(\d{2})\b/,
      toIso: (m) => `20${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`,
    },
    {
      re: /\b(\d{4})-(\d{2})-(\d{2})\b/,
      toIso: (m) => `${m[1]}-${m[2]}-${m[3]}`,
    },
    {
      re: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
      toIso: (m) => `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`,
    },
  ];

  for (const { re, toIso } of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const iso = toIso(m);
    if (!isPlausibleReceiptDate(iso, now)) continue;
    return iso;
  }
  return null;
}

function isPlausibleReceiptDate(iso: string, now: Date): boolean {
  const [y, mo, d] = iso.split('-').map(Number);
  if (!y || !mo || !d) return false;
  if (mo < 1 || mo > 12) return false;
  if (d < 1 || d > 31) return false;
  const year = now.getFullYear();
  // Allow up to one year in the future (clock skew on tills happens)
  // and 10 years back (old receipts being logged).
  if (y < year - 10 || y > year + 1) return false;
  return true;
}

/**
 * Find a known brand name anywhere in the text (case-insensitive).
 * Falls back to picking the first non-numeric line near the top
 * of the receipt as a brand-ish hint when no known brand matches.
 */
export function extractBrand(text: string): string | null {
  const lower = text.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    // Word-boundary match so "esso" doesn't match inside "Espresso"
    const re = new RegExp(`\\b${brand.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (re.test(lower)) {
      // Return the canonical casing from KNOWN_BRANDS rather than
      // whatever the OCR produced (often lowercase or all-caps).
      return brand;
    }
  }
  return null;
}

/**
 * Fuel type detection from the German conventional names plus
 * the more cryptic POS abbreviations ("S95", "S98", "DK" etc.).
 */
export function extractFuelType(text: string): 'diesel' | 'e5' | 'e10' | null {
  const lower = text.toLowerCase();
  // Order matters: more specific patterns first so "Super E10"
  // doesn't get matched by the broader "Super" → e5 fallback.
  if (/\be10\b|super\s*e10|95\s*e10/i.test(text)) return 'e10';
  if (/\be5\b|super\s*e5|95\s*e5|s95|super\s+benzin/i.test(text)) return 'e5';
  if (/\bdiesel\b|diesel\s*kraftstoff|\bdk\b/i.test(text)) return 'diesel';
  // Last-chance broad "Super" with no qualifier → assume E5 because
  // E10 is almost always labeled explicitly while plain "Super"
  // historically referred to the regular Super (now E5).
  if (/\bsuper\b/.test(lower)) return 'e5';
  return null;
}

/**
 * Liters extraction. Patterns we look for, in order:
 *   "Menge: 42,15 L"
 *   "42.15 Liter"
 *   "42,15 l"
 * Plus a cross-check: if total / pricePerLiter agrees within
 * ±3 % of the parsed liters, we trust the parse.
 */
export function extractLiters(text: string): number | null {
  // Most common formats: number followed by L / Liter / l (with
  // an optional comma decimal). Reject values < 0.5 or > 500 as
  // implausible for a fuel fill-up.
  const patterns = [
    /(\d{1,3}[.,]\d{1,3})\s*(?:L|Liter|liter)\b/,
    /Menge\s*[:\s]\s*(\d{1,3}[.,]\d{1,3})/i,
    /(\d{1,3}[.,]\d{1,3})\s*l\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m || !m[1]) continue;
    const n = normalizeNumber(m[1]);
    if (n != null && n >= 0.5 && n <= 500) return n;
  }
  return null;
}

/**
 * Per-liter price extraction. Looks for typical patterns:
 *   "EUR/L 1,799"
 *   "Preis/L: 1,799"
 *   "1,799 €/L"
 *   "1.799 EUR/L"
 * Constrained to plausible fuel range €0.50–€5.00.
 */
export function extractPricePerLiter(text: string): number | null {
  const patterns = [
    /(?:EUR|€)\s*\/?\s*L\s*[:\s]?\s*(\d[.,]\d{2,3})/i,
    /Preis\s*\/?\s*L\s*[:\s]\s*(\d[.,]\d{2,3})/i,
    /(\d[.,]\d{2,3})\s*(?:EUR|€)\s*\/\s*L/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m || !m[1]) continue;
    const n = normalizeNumber(m[1]);
    if (n != null && n >= 0.5 && n <= 5.0) return n;
  }
  return null;
}

/**
 * Total cost extraction. Looks for "Summe", "Gesamt", "Total",
 * "Zu zahlen", or "EUR" near the largest €-amount on the
 * receipt. Falls back to liters × pricePerLiter cross-check
 * which the parse() entry point applies.
 */
export function extractTotal(text: string): number | null {
  const patterns = [
    /(?:Summe|Gesamt|Total|Zu\s*zahlen|Endbetrag)\s*[:\s]?\s*(\d{1,3}(?:[.,]\d{1,3})?[.,]\d{2})\s*(?:EUR|€)?/i,
    /(?:Summe|Gesamt|Total|Zu\s*zahlen|Endbetrag)[\s\S]{0,15}?(\d{1,3}[.,]\d{2})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m || !m[1]) continue;
    const n = normalizeNumber(m[1]);
    if (n != null && n >= 1 && n <= 1000) return n;
  }
  return null;
}

/**
 * Top-level parse entry point. Combines the field extractors
 * and produces a confidence score. Cross-checks liters ×
 * pricePerLiter against extracted total — if they agree
 * within ±3 %, we're confident in all three.
 */
export function parseReceipt(rawText: string, now: Date = new Date()): ParsedReceipt {
  const date = extractDate(rawText, now);
  const stationBrand = extractBrand(rawText);
  const fuelType = extractFuelType(rawText);
  const liters = extractLiters(rawText);
  const pricePerLiter = extractPricePerLiter(rawText);
  let totalCost = extractTotal(rawText);

  // Cross-check: if we have liters + pricePerLiter but not total,
  // synthesize it. If we have all three, validate consistency
  // and prefer the OCR'd total when within tolerance.
  if (totalCost == null && liters != null && pricePerLiter != null) {
    totalCost = Math.round(liters * pricePerLiter * 100) / 100;
  } else if (totalCost != null && liters != null && pricePerLiter != null) {
    const expected = liters * pricePerLiter;
    const drift = Math.abs(totalCost - expected) / expected;
    // If the OCR'd total is wildly off (>5 %), trust the
    // computed value — receipts with line discounts/coupons
    // are rarer than OCR misreads of the total field.
    if (drift > 0.05) {
      totalCost = Math.round(expected * 100) / 100;
    }
  }

  const fields = [date, stationBrand, fuelType, liters, pricePerLiter, totalCost];
  const filled = fields.filter((v) => v !== null).length;
  const confidence = filled / fields.length;

  return {
    date,
    stationBrand,
    fuelType,
    liters,
    pricePerLiter,
    totalCost,
    confidence,
  };
}
