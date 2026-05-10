// ============================================================
// Fuelyn — Spritmonitor.de CSV importer
//
// Spritmonitor is the largest German fuel-tracker. Their CSV
// export is semicolon-separated, German-locale (comma decimal),
// UTF-8 with optional BOM. Header row uses German column names
// and the column ORDER varies between exports — we resolve
// columns by header name, not position.
//
// Maps to our internal FuelLogEntry shape (see core/domain/types).
// Errors per row are non-fatal: bad rows are collected into a
// `skipped` array so the user sees what didn't import without
// blocking the whole batch.
//
// Reference for the upstream format:
//   https://www.spritmonitor.de/de/hilfe/import_export.html
// ============================================================

import type { FuelType, FuelLogEntry } from '../domain/types';

export interface SpritmonitorRow {
  date: string;            // ISO yyyy-mm-dd
  odometer: number;        // km
  trip: number | null;     // km since last fill (optional)
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  fuelType: FuelType;
  stationName: string;
  stationBrand: string;
  note: string;
}

export interface ImportError {
  rowNumber: number;       // 1-based, excluding header
  reason: string;
  raw: string;             // original raw row content for debugging
}

export interface SpritmonitorImportResult {
  /** Successfully parsed rows ready to feed to addFuelLogEntry. */
  entries: FuelLogEntry[];
  /** Non-fatal per-row errors. */
  skipped: ImportError[];
  /** Total rows the CSV had (excluding header). */
  totalRows: number;
}

// ─── Header normalisation ──────────────────────────────────

/**
 * Spritmonitor header → canonical key. Both German and English
 * exports are accepted; lowercased + diacritic-stripped on lookup.
 */
const HEADER_ALIASES: Record<string, keyof SpritmonitorRow | 'ignore'> = {
  // German export
  'datum': 'date',
  'kilometerstand': 'odometer',
  'km-stand': 'odometer',
  'strecke': 'trip',
  'menge': 'liters',
  'gesamtpreis': 'totalCost',
  'preis': 'pricePerLiter',
  'kraftstoff': 'fuelType',
  'kraftstoffart': 'fuelType',
  'tankstelle': 'stationName',
  'marke': 'stationBrand',
  'notiz': 'note',
  'bemerkung': 'note',
  // English export (Spritmonitor.com locale)
  'date': 'date',
  'odometer': 'odometer',
  'trip': 'trip',
  'quantity': 'liters',
  'total cost': 'totalCost',
  'unit price': 'pricePerLiter',
  'fuel type': 'fuelType',
  'fuel': 'fuelType',
  'station': 'stationName',
  'brand': 'stationBrand',
  'note': 'note',
  'comment': 'note',
};

function normHeader(s: string): string {
  return s
    .toLowerCase()
    .trim()
    // Strip BOM that some exports leave on the first cell
    .replace(/^﻿/, '')
    .replace(/[äöüß]/g, (m) => ({ ä: 'a', ö: 'o', ü: 'u', ß: 'ss' })[m] ?? m);
}

// ─── Field-level parsers ───────────────────────────────────

function parseGermanNumber(raw: string): number | null {
  if (!raw) return null;
  // German: 1.234,56 → 1234.56 ; English: 1,234.56 → 1234.56
  // We strip whitespace, then heuristically detect which is the
  // decimal separator: whichever appears LAST is the decimal.
  const clean = raw.trim().replace(/\s/g, '');
  if (!clean) return null;
  const lastComma = clean.lastIndexOf(',');
  const lastDot = clean.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = clean.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = clean.replace(/,/g, '');
  } else {
    normalized = clean;
  }
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // dd.mm.yyyy (German Spritmonitor default)
  const de = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (de) return `${de[3]}-${de[2]!.padStart(2, '0')}-${de[1]!.padStart(2, '0')}`;
  // yyyy-mm-dd (English ISO)
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // mm/dd/yyyy (US format some Spritmonitor.com users export)
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1]!.padStart(2, '0')}-${us[2]!.padStart(2, '0')}`;
  return null;
}

function parseFuelType(raw: string): FuelType | null {
  if (!raw) return null;
  const s = raw.toLowerCase().trim();
  // Spritmonitor uses many free-form names. We map the most
  // common ones; anything unknown returns null and the row
  // is rejected with a clear reason.
  if (/diesel/.test(s) || /^d$/.test(s)) return 'diesel';
  if (/e10/.test(s) || /super.?e10/.test(s) || /95.?e10/.test(s)) return 'e10';
  if (/e5/.test(s) || /super.?e5/.test(s) || /95.?e5/.test(s)) return 'e5';
  if (/super.?plus/.test(s) || /^v.?power/.test(s) || /98/.test(s)) return 'e5'; // map premium to e5 bucket
  if (/super/.test(s) || /benzin/.test(s) || /^b$/.test(s)) return 'e5';
  return null;
}

// ─── CSV split (RFC 4180-ish, semicolon delimiter) ────────

/**
 * Tiny CSV row splitter. Handles quoted fields with embedded
 * delimiters and escaped double-quotes ("" → "). Default
 * delimiter is semicolon (Spritmonitor) but accepts a custom
 * one for tests / English exports.
 */
export function splitCsvRow(row: string, delimiter = ';'): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

// ─── Top-level entry ──────────────────────────────────────

export interface ImportOptions {
  /** ID generator (defaults to crypto.randomUUID where available). */
  newId?: () => string;
  /** Override the CSV delimiter. Auto-detected when omitted. */
  delimiter?: string;
}

function detectDelimiter(headerLine: string): string {
  // Spritmonitor's German export is ";". The English one is ",".
  // Whichever appears MORE in the header line wins.
  const semis = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  return semis >= commas ? ';' : ',';
}

function defaultIdGen(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Parse a Spritmonitor CSV blob into FuelLogEntry rows.
 * Pure function: no I/O, no globals beyond crypto.randomUUID.
 */
export function parseSpritmonitorCsv(
  raw: string,
  options: ImportOptions = {},
): SpritmonitorImportResult {
  const newId = options.newId ?? defaultIdGen;

  const text = raw.replace(/^﻿/, ''); // strip BOM
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return { entries: [], skipped: [], totalRows: 0 };
  }

  const delimiter = options.delimiter ?? detectDelimiter(lines[0]!);
  const headers = splitCsvRow(lines[0]!, delimiter).map(normHeader);

  // Build header → canonical-key index lookup. Unknown columns
  // are silently ignored (Spritmonitor has plenty of optional
  // fields we don't care about).
  const colIndex: Partial<Record<keyof SpritmonitorRow, number>> = {};
  headers.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key && key !== 'ignore') colIndex[key] = i;
  });

  const required: (keyof SpritmonitorRow)[] = [
    'date',
    'liters',
    'fuelType',
  ];
  const missingRequired = required.filter((k) => colIndex[k] === undefined);
  if (missingRequired.length > 0) {
    return {
      entries: [],
      skipped: [
        {
          rowNumber: 0,
          reason: `Missing required columns: ${missingRequired.join(', ')}`,
          raw: lines[0]!,
        },
      ],
      totalRows: 0,
    };
  }

  const entries: FuelLogEntry[] = [];
  const skipped: ImportError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvRow(lines[i]!, delimiter);
    const get = (k: keyof SpritmonitorRow): string => {
      const idx = colIndex[k];
      return idx === undefined ? '' : (cells[idx] ?? '').trim();
    };

    const date = parseDate(get('date'));
    const liters = parseGermanNumber(get('liters'));
    const fuelType = parseFuelType(get('fuelType'));
    const totalCost = parseGermanNumber(get('totalCost'));
    const pricePerLiterRaw = parseGermanNumber(get('pricePerLiter'));
    const odometer = parseGermanNumber(get('odometer'));

    const reason: string[] = [];
    if (!date) reason.push('invalid date');
    if (!liters || liters <= 0) reason.push('invalid liters');
    if (!fuelType) reason.push('unknown fuel type');

    if (reason.length > 0 || !date || !liters || !fuelType) {
      skipped.push({
        rowNumber: i,
        reason: reason.join(', '),
        raw: lines[i]!,
      });
      continue;
    }

    // Synthesize total/price-per-liter when one is missing.
    let pricePerLiter = pricePerLiterRaw;
    let total = totalCost;
    if (pricePerLiter == null && total != null) {
      pricePerLiter = total / liters;
    }
    if (total == null && pricePerLiter != null) {
      total = pricePerLiter * liters;
    }
    if (pricePerLiter == null || total == null) {
      skipped.push({
        rowNumber: i,
        reason: 'missing both total and unit price',
        raw: lines[i]!,
      });
      continue;
    }

    // Build the FuelLogEntry. Date stays as ISO yyyy-mm-dd
    // (no timezone) — fuel-log entries are calendar-day events.
    const entry: FuelLogEntry = {
      id: newId(),
      date: `${date}T12:00:00.000Z`, // anchor at noon UTC for consistent ordering
      stationName: get('stationName') || get('stationBrand') || 'Unknown',
      stationBrand: get('stationBrand') || '',
      fuelType,
      liters: Math.round(liters * 1000) / 1000,
      pricePerLiter: Math.round(pricePerLiter * 1000) / 1000,
      totalCost: Math.round(total * 100) / 100,
      odometer: odometer != null && odometer > 0 ? Math.round(odometer) : undefined,
      note: get('note') || undefined,
    };
    entries.push(entry);
  }

  return {
    entries,
    skipped,
    totalRows: lines.length - 1,
  };
}
