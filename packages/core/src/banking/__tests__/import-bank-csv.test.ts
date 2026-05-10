// ============================================================
// Bank CSV importer tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import { parseBankCsv, splitCsvRow } from '../import-bank-csv';

describe('splitCsvRow', () => {
  it('splits simple semicolon rows', () => {
    expect(splitCsvRow('a;b;c', ';')).toEqual(['a', 'b', 'c']);
  });

  it('respects quoted fields with embedded delimiter', () => {
    expect(splitCsvRow('"a;b";c', ';')).toEqual(['a;b', 'c']);
  });

  it('handles escaped double-quotes', () => {
    expect(splitCsvRow('"hello ""world""";x', ';')).toEqual(['hello "world"', 'x']);
  });

  it('trims whitespace per cell', () => {
    expect(splitCsvRow('  a ; b ;c ', ';')).toEqual(['a', 'b', 'c']);
  });
});

describe('parseBankCsv — DKB Sparkasse-style format', () => {
  const dkb = [
    '"Buchungstag";"Wertstellung";"Auftraggeber/Empfaenger";"Verwendungszweck";"Betrag (EUR)"',
    '"12.05.2026";"12.05.2026";"ARAL TANKSTELLE BERLIN";"E10 38,5 L";-67,40',
    '"10.05.2026";"10.05.2026";"Edeka Berlin";"Lebensmittel";-42,17',
    '"08.05.2026";"08.05.2026";"Shell Service Station";"Diesel";-89,50',
    '"01.05.2026";"01.05.2026";"Arbeitgeber";"Gehalt";+3500,00',
  ].join('\n');

  it('detects DKB / Sparkasse-style header', () => {
    const r = parseBankCsv(dkb);
    expect(['dkb', 'sparkasse']).toContain(r.bank);
  });

  it('extracts only fuel-station rows', () => {
    const r = parseBankCsv(dkb);
    expect(r.rows).toHaveLength(2);
    expect(r.rows.map((x) => x.stationBrand).sort()).toEqual(['Aral', 'Shell']);
  });

  it('parses German amount format with comma decimal', () => {
    const r = parseBankCsv(dkb);
    const aral = r.rows.find((x) => x.stationBrand === 'Aral');
    expect(aral?.totalCost).toBeCloseTo(67.40, 2);
  });

  it('converts dd.mm.yyyy → ISO yyyy-mm-dd', () => {
    const r = parseBankCsv(dkb);
    expect(r.rows[0]?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseBankCsv — ING-DiBa / N26 format', () => {
  const n26 = [
    'Booking Date,Value Date,Partner Name,Payment Reference,Amount (EUR)',
    '2026-05-12,2026-05-12,"BP TANKSTELLE","Diesel 42L",-72.30',
    '2026-05-11,2026-05-11,"Amazon EU",,-25.99',
  ].join('\n');

  it('detects N26 by header tokens', () => {
    const r = parseBankCsv(n26);
    expect(r.bank).toBe('n26');
  });

  it('handles ISO dates and dot-decimal amounts', () => {
    const r = parseBankCsv(n26);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.date).toBe('2026-05-12');
    expect(r.rows[0]?.totalCost).toBeCloseTo(72.30, 2);
    expect(r.rows[0]?.stationBrand).toBe('BP');
  });
});

describe('parseBankCsv — filtering rules', () => {
  const broad = [
    'Datum;Empfaenger;Betrag',
    '01.05.2026;Aral Tankstelle Berlin;-3,50',     // too small
    '02.05.2026;Aral Tankstelle Berlin;-260,00',   // too large
    '03.05.2026;Aral Tankstelle Berlin;-50,00',    // OK
    '04.05.2026;Esso Express;-89,00',
    '05.05.2026;Edeka;-50,00',                     // not fuel
  ].join('\n');

  it('drops amounts outside [8, 250] EUR', () => {
    const r = parseBankCsv(broad);
    const arals = r.rows.filter((x) => x.stationBrand === 'Aral');
    expect(arals).toHaveLength(1);
    expect(arals[0]?.totalCost).toBe(50);
  });

  it('keeps Esso payment of 89 €', () => {
    const r = parseBankCsv(broad);
    expect(r.rows.some((x) => x.stationBrand === 'Esso')).toBe(true);
  });

  it('rejects Edeka grocery despite plausible amount', () => {
    const r = parseBankCsv(broad);
    expect(r.rows.find((x) => x.merchant.includes('edeka'))).toBeUndefined();
  });
});

describe('parseBankCsv — preamble handling', () => {
  const sparkasseWithPreamble = [
    'Konto: Girokonto',
    'Saldo: 1.234,56 EUR',
    'Buchungstag;Wertstellung;Auftraggeber/Empfaenger;Verwendungszweck;Betrag (EUR)',
    '15.05.2026;15.05.2026;Shell Service Station;E10;-78,40',
  ].join('\n');

  it('skips top-of-file preamble before the actual header', () => {
    const r = parseBankCsv(sparkasseWithPreamble);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]?.stationBrand).toBe('Shell');
  });
});

describe('parseBankCsv — empty / malformed inputs', () => {
  it('returns empty result for empty input', () => {
    const r = parseBankCsv('');
    expect(r.bank).toBe('unknown');
    expect(r.rows).toEqual([]);
  });

  it('records malformed rows in skipped[]', () => {
    const csv = [
      'Buchungstag;Empfaenger;Betrag',
      '12.05.2026;Aral;not-a-number',
    ].join('\n');
    const r = parseBankCsv(csv);
    expect(r.rows).toHaveLength(0);
    expect(r.skipped.length).toBeGreaterThan(0);
  });

  it('handles BOM-prefixed UTF-8 files', () => {
    const csv = '﻿' + [
      'Buchungstag;Empfaenger;Betrag',
      '12.05.2026;Aral Tankstelle;-50,00',
    ].join('\n');
    const r = parseBankCsv(csv);
    expect(r.rows).toHaveLength(1);
  });
});
