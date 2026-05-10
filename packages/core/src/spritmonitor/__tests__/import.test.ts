// ============================================================
// parseSpritmonitorCsv — exhaustive Spritmonitor.de import tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { parseSpritmonitorCsv, splitCsvRow } from '../import';

let counter = 0;
const fixedId = () => `id-${++counter}`;

describe('splitCsvRow', () => {
  it('splits a simple semicolon row', () => {
    expect(splitCsvRow('a;b;c')).toEqual(['a', 'b', 'c']);
  });

  it('preserves empty trailing fields', () => {
    expect(splitCsvRow('a;;c')).toEqual(['a', '', 'c']);
  });

  it('handles quoted fields with embedded delimiters', () => {
    expect(splitCsvRow('"a;b";c')).toEqual(['a;b', 'c']);
  });

  it('unescapes doubled double-quotes inside quoted fields', () => {
    expect(splitCsvRow('"he said ""hi""";next')).toEqual(['he said "hi"', 'next']);
  });

  it('accepts a custom delimiter (comma for English exports)', () => {
    expect(splitCsvRow('a,b,c', ',')).toEqual(['a', 'b', 'c']);
  });
});

describe('parseSpritmonitorCsv — happy path (German export)', () => {
  beforeEach(() => {
    counter = 0;
  });

  function beforeEach(fn: () => void): void {
    // vitest-style helper to keep the per-block id reset local
    fn();
  }

  it('parses a standard German Spritmonitor CSV', () => {
    const csv = [
      'Datum;Kilometerstand;Strecke;Menge;Preis;Gesamtpreis;Kraftstoff;Tankstelle;Marke;Notiz',
      '13.05.2026;125678;520;42,15;1,799;75,83;Diesel;Hauptstr. 12;Aral;Vor dem Urlaub',
      '08.05.2026;125158;480;38,90;1,829;71,15;Super E10;Bahnhofstr.;Shell;',
      '03.05.2026;124678;510;41,20;1,749;72,06;Diesel;Autobahn;BP;Schnellladung neben Toilette',
    ].join('\n');

    const r = parseSpritmonitorCsv(csv, { newId: fixedId });
    expect(r.totalRows).toBe(3);
    expect(r.skipped).toEqual([]);
    expect(r.entries).toHaveLength(3);

    const [first, second, third] = r.entries;
    expect(first?.date).toBe('2026-05-13T12:00:00.000Z');
    expect(first?.fuelType).toBe('diesel');
    expect(first?.liters).toBe(42.15);
    expect(first?.pricePerLiter).toBe(1.799);
    expect(first?.totalCost).toBe(75.83);
    expect(first?.stationBrand).toBe('Aral');
    expect(first?.odometer).toBe(125678);
    expect(first?.note).toBe('Vor dem Urlaub');

    expect(second?.fuelType).toBe('e10');
    expect(third?.fuelType).toBe('diesel');
  });
});

describe('parseSpritmonitorCsv — English export', () => {
  it('parses the comma-delimited English variant', () => {
    counter = 0;
    const csv = [
      'date,odometer,trip,quantity,unit price,total cost,fuel type,station,brand,note',
      '2026-05-13,125678,520,42.15,1.799,75.83,Diesel,Main St. 12,Aral,',
      '2026-05-08,125158,480,38.90,1.829,71.15,Super E10,Bahnhof Rd.,Shell,',
    ].join('\n');

    const r = parseSpritmonitorCsv(csv, { newId: fixedId });
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]?.fuelType).toBe('diesel');
    expect(r.entries[1]?.fuelType).toBe('e10');
  });
});

describe('parseSpritmonitorCsv — synthesis fallbacks', () => {
  it('synthesizes totalCost when only price-per-liter is present', () => {
    counter = 0;
    const csv = [
      'Datum;Menge;Preis;Kraftstoff',
      '13.05.2026;40,00;2,00;Diesel',
    ].join('\n');
    const r = parseSpritmonitorCsv(csv, { newId: fixedId });
    expect(r.entries[0]?.totalCost).toBe(80);
  });

  it('synthesizes pricePerLiter when only total is present', () => {
    counter = 0;
    const csv = [
      'Datum;Menge;Gesamtpreis;Kraftstoff',
      '13.05.2026;40,00;80,00;Diesel',
    ].join('\n');
    const r = parseSpritmonitorCsv(csv, { newId: fixedId });
    expect(r.entries[0]?.pricePerLiter).toBe(2);
  });
});

describe('parseSpritmonitorCsv — error collection', () => {
  it('skips rows with invalid dates and reports them', () => {
    counter = 0;
    const csv = [
      'Datum;Menge;Preis;Kraftstoff',
      '13.05.2026;40,00;2,00;Diesel',
      'not-a-date;40,00;2,00;Diesel',
      '13.05.2026;40,00;2,00;Plutonium',
    ].join('\n');
    const r = parseSpritmonitorCsv(csv, { newId: fixedId });
    expect(r.entries).toHaveLength(1);
    expect(r.skipped).toHaveLength(2);
    expect(r.skipped[0]?.reason).toMatch(/invalid date/);
    expect(r.skipped[1]?.reason).toMatch(/unknown fuel type/);
  });

  it('returns a single header-error entry when required columns are missing', () => {
    const csv = [
      'Datum;Notiz',
      '13.05.2026;ohne menge',
    ].join('\n');
    const r = parseSpritmonitorCsv(csv);
    expect(r.entries).toHaveLength(0);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]?.rowNumber).toBe(0);
    expect(r.skipped[0]?.reason).toMatch(/Missing required columns/);
  });

  it('returns empty result for empty/header-only CSV', () => {
    expect(parseSpritmonitorCsv('').entries).toEqual([]);
    expect(parseSpritmonitorCsv('Datum;Menge;Kraftstoff').entries).toEqual([]);
  });
});

describe('parseSpritmonitorCsv — number locale tolerance', () => {
  it('handles German thousands-dot + decimal-comma', () => {
    counter = 0;
    const csv = [
      'Datum;Menge;Preis;Kraftstoff',
      '13.05.2026;1.234,56;2,00;Diesel',
    ].join('\n');
    const r = parseSpritmonitorCsv(csv, { newId: fixedId });
    // The 1234.56 L is implausible but the parser must NOT
    // reject on that — it's not the parser's job to enforce
    // domain plausibility, only to honour the locale format.
    expect(r.entries[0]?.liters).toBe(1234.56);
  });

  it('handles English thousands-comma + decimal-dot when properly quoted', () => {
    counter = 0;
    // Comma-delimited CSV with a thousands-comma inside a quoted
    // value — exactly the shape Excel emits when the cell would
    // otherwise be ambiguous.
    const csv = [
      'date,quantity,unit price,fuel type',
      '2026-05-13,"1,234.56",2.00,Diesel',
    ].join('\n');
    const r = parseSpritmonitorCsv(csv, { newId: fixedId });
    expect(r.entries[0]?.liters).toBe(1234.56);
  });
});

describe('parseSpritmonitorCsv — BOM + line-ending tolerance', () => {
  it('strips a UTF-8 BOM at the start of the file', () => {
    counter = 0;
    const csv = '﻿Datum;Menge;Preis;Kraftstoff\n13.05.2026;40,00;2,00;Diesel';
    const r = parseSpritmonitorCsv(csv, { newId: fixedId });
    expect(r.entries).toHaveLength(1);
  });

  it('handles CRLF line endings', () => {
    counter = 0;
    const csv = 'Datum;Menge;Preis;Kraftstoff\r\n13.05.2026;40,00;2,00;Diesel\r\n';
    const r = parseSpritmonitorCsv(csv, { newId: fixedId });
    expect(r.entries).toHaveLength(1);
  });
});
