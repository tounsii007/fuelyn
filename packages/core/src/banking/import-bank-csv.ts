// ============================================================
// Open-Banking CSV Importer
//
// Reads a CSV exported from a German retail bank (DKB, Sparkasse,
// Commerzbank/Comdirect, ING-DiBa, N26, Postbank etc.) and pulls
// out the rows that look like fuel-station transactions, producing
// candidate FuelLogEntry records.
//
// What we know from a bank line:
//   * date         (✓ — booking or value date)
//   * merchant     (✓ — narration / counterparty)
//   * amount EUR   (✓ — negative = payment)
//
// What we DO NOT know:
//   * litres
//   * €/L
//   * fuel grade
//
// So the importer emits each candidate with `liters` and
// `pricePerLiter` defaulted to 0 and a sensible `fuelType` guess
// (the user's preferred fuel) — the UI then prompts the user to
// fill the missing fields per row before final commit. This is
// the same pattern as the receipt scanner.
//
// Pure / deterministic: text in, structured records out.
// ============================================================

import type { FuelType } from '../domain/types';

// -----------------------------------------------------------------
// Types
// -----------------------------------------------------------------

export interface BankImportRow {
  /** ISO yyyy-mm-dd. */
  date: string;
  /** Merchant / counterparty name (lower-cased and trimmed). */
  merchant: string;
  /** Cleaned merchant name suitable for display (preserves casing). */
  merchantDisplay: string;
  /** Recognised brand if any of the KNOWN_BRANDS list matched. */
  stationBrand: string;
  /** Total amount in EUR (always positive — caller side already
   *  picked the debit column). */
  totalCost: number;
}

export interface BankImportResult {
  bank: 'dkb' | 'sparkasse' | 'ing' | 'comdirect' | 'n26' | 'unknown';
  rows: BankImportRow[];
  /** Total rows processed (incl. non-fuel) for the progress UI. */
  totalRowsScanned: number;
  /** Rows we couldn't parse — fed back to the UI as a hint. */
  skipped: Array<{ raw: string; reason: string }>;
}

export interface BankImportOptions {
  /** Used to default fuelType on emitted candidates. */
  preferredFuel?: FuelType;
  /** Override the default brand list. */
  brands?: readonly string[];
}

// -----------------------------------------------------------------
// Brand recognition
// -----------------------------------------------------------------

const DEFAULT_BRANDS = [
  'Aral', 'Shell', 'Esso', 'Total', 'TotalEnergies', 'Jet', 'BP',
  'Star', 'Avia', 'HEM', 'OMV', 'Agip', 'Eni', 'Q1', 'Q8',
  'Westfalen', 'bft', 'Sprint', 'Allguth', 'Raiffeisen', 'Hoyer',
  'Knies', 'Tankpool24', 'Gulf', 'Orlen',
];

const FUEL_KEYWORDS = [
  'tankstelle', 'tank ', 'fuel', 'gas station', 'kraftstoff', 'sprit',
  'auto', 'autohof', 'rastanlage', 'rastplatz',
];

// -----------------------------------------------------------------
// CSV utilities
// -----------------------------------------------------------------

function detectDelimiter(line: string): ';' | ',' {
  const semis = (line.match(/;/g) || []).length;
  const commas = (line.match(/,/g) || []).length;
  return semis >= commas ? ';' : ',';
}

/**
 * Tolerant CSV row splitter: quoted fields, escaped quotes, trailing
 * whitespace ignored. Doesn't try to be RFC-4180-perfect, just real-
 * world bank-export-correct.
 */
export function splitCsvRow(line: string, delimiter: ';' | ','): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delimiter) {
        out.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseAmount(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/€/g, '')
    .replace(/\s+/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '') // strip thousands dots
    .replace(',', '.')
    .replace('+', '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse a date that might be `dd.mm.yyyy` (German), `yyyy-mm-dd` (ISO),
 * or `dd/mm/yyyy` (some banks). Returns ISO yyyy-mm-dd or null.
 */
function parseBankDate(raw: string): string | null {
  if (!raw) return null;
  const t = raw.trim();
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(t);
  if (m) return `20${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return null;
}

// -----------------------------------------------------------------
// Bank-format detector
// -----------------------------------------------------------------

function detectBank(headerLine: string): BankImportResult['bank'] {
  const h = headerLine.toLowerCase();
  // N26 must be checked before ING because both share "booking date"
  // but only N26 also has "partner name".
  if (h.includes('partner name') || (h.includes('payment reference') && h.includes('booking date'))) {
    return 'n26';
  }
  if ((h.includes('buchungstag') || h.includes('buchungsdatum')) && h.includes('verwendungszweck')) {
    if (h.includes('belegdatum')) return 'comdirect';
    if (h.includes('umsatztyp')) return 'sparkasse';
    return 'dkb';
  }
  if (h.includes('booking date') || h.includes('value date')) return 'ing';
  return 'unknown';
}

// -----------------------------------------------------------------
// Public entry-point
// -----------------------------------------------------------------

const FUEL_AMOUNT_MIN = 8;   // smallest plausible fill (€)
const FUEL_AMOUNT_MAX = 250; // largest plausible fill (€)

export function parseBankCsv(
  raw: string,
  opts: BankImportOptions = {},
): BankImportResult {
  // Strip a UTF-8 BOM (U+FEFF) if present — many German bank exports
  // prepend one. RegExp built from a string so the source file stays
  // free of irregular-whitespace literals.
  const text = raw.replace(new RegExp('^\\uFEFF'), '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { bank: 'unknown', rows: [], totalRowsScanned: 0, skipped: [] };
  }

  // Some banks prefix the CSV with a few "Konto:", "Saldo:" rows
  // before the actual table header. Find the first row that looks
  // like a header by counting delimiter density.
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const l = lines[i]!.toLowerCase();
    // Header rows always carry one of: "buchungstag" (German booking
    // day), "datum" (date), "date" (English), or "wertstellung"
    // (value date) plus a delimiter density that beats the preamble.
    if (
      l.includes('buchungstag') ||
      l.includes('buchungsdatum') ||
      l.includes('datum') ||
      l.includes('date') ||
      l.includes('wertstellung')
    ) {
      headerIdx = i;
      break;
    }
  }
  const headerLine = lines[headerIdx]!;
  const delimiter = detectDelimiter(headerLine);
  const header = splitCsvRow(headerLine, delimiter).map((h) => h.toLowerCase());
  const bank = detectBank(headerLine);

  const dateCol = pickCol(header, ['buchungstag', 'buchungsdatum', 'belegdatum', 'date', 'wertstellung', 'datum']);
  const merchantCol = pickCol(header, ['auftraggeber', 'empfaenger', 'verwendungszweck', 'partner name', 'beguenstigter', 'description', 'narration']);
  const amountCol = pickCol(header, ['betrag', 'amount', 'umsatz', 'soll', 'wert (eur)']);

  const skipped: BankImportResult['skipped'] = [];
  const rows: BankImportRow[] = [];
  const brands = (opts.brands ?? DEFAULT_BRANDS).map((b) => b.toLowerCase());

  let scanned = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]!;
    scanned++;
    const cols = splitCsvRow(line, delimiter);
    const date = parseBankDate(cols[dateCol] ?? '');
    const amount = parseAmount(cols[amountCol] ?? '');
    const merchant = (cols[merchantCol] ?? '').replace(/\s+/g, ' ').trim();

    if (!date || amount == null || !merchant) {
      skipped.push({ raw: line, reason: 'missing-fields' });
      continue;
    }

    // Bank exports use negative amounts for payments. We're only
    // interested in outgoing money (= fuel cost). Flip the sign to
    // positive for downstream display.
    const payment = amount < 0 ? -amount : amount;
    if (payment < FUEL_AMOUNT_MIN || payment > FUEL_AMOUNT_MAX) {
      // out-of-range amounts are silently filtered (most are not fuel)
      continue;
    }

    const lowerMerchant = merchant.toLowerCase();
    const matchedBrand =
      brands.find((b) => lowerMerchant.includes(b)) ??
      (FUEL_KEYWORDS.some((k) => lowerMerchant.includes(k)) ? 'tankstelle' : null);

    if (!matchedBrand) continue; // not a fuel transaction

    // Recover the canonical brand casing from the original list.
    const canonical =
      DEFAULT_BRANDS.find((b) => b.toLowerCase() === matchedBrand) ??
      capitalize(matchedBrand);

    rows.push({
      date,
      merchant: lowerMerchant,
      merchantDisplay: merchant,
      stationBrand: canonical,
      totalCost: round(payment, 2),
    });
  }

  return { bank, rows, totalRowsScanned: scanned, skipped };
}

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

function pickCol(header: string[], candidates: string[]): number {
  for (const c of candidates) {
    const i = header.findIndex((h) => h === c || h.includes(c));
    if (i >= 0) return i;
  }
  // Fall back to a sentinel that always misses; downstream code
  // already gracefully handles missing columns by emitting skipped rows.
  return -1;
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
