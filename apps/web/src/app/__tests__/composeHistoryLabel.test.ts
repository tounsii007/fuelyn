// @vitest-environment jsdom

// ============================================================
// composeHistoryLabel — the helper that decides what shows up
// in the "Letzte Suchen" pill. Must produce visually distinct
// labels for distinct addresses inside the same city, and
// degrade gracefully when Nominatim doesn't return all the
// structured fields.
// ============================================================

import { describe, it, expect } from 'vitest';
import { composeHistoryLabel } from '../page';

const FALLBACK = '50.80, 8.77';

describe('composeHistoryLabel', () => {
  it('produces full street-level label when all fields are present', () => {
    expect(
      composeHistoryLabel(
        {
          display_name: 'X',
          address: {
            road: 'Hauptstraße',
            house_number: '12',
            postcode: '35037',
            city: 'Marburg',
          },
        },
        FALLBACK,
      ),
    ).toBe('Hauptstraße 12, 35037 Marburg');
  });

  it('two distinct buildings in the same city produce DIFFERENT labels', () => {
    const a = composeHistoryLabel(
      {
        display_name: '',
        address: {
          road: 'Hauptstraße',
          house_number: '12',
          postcode: '35037',
          city: 'Marburg',
        },
      },
      FALLBACK,
    );
    const b = composeHistoryLabel(
      {
        display_name: '',
        address: {
          road: 'Bahnhofstraße',
          house_number: '5',
          postcode: '35037',
          city: 'Marburg',
        },
      },
      FALLBACK,
    );
    expect(a).not.toBe(b);
    expect(a).toContain('Hauptstraße');
    expect(b).toContain('Bahnhofstraße');
  });

  it('degrades to PLZ + city when no road information available', () => {
    expect(
      composeHistoryLabel(
        {
          display_name: 'Marburg',
          address: {
            postcode: '35037',
            city: 'Marburg',
          },
        },
        FALLBACK,
      ),
    ).toBe('35037 Marburg');
  });

  it('uses suburb + city when only suburb is reported', () => {
    expect(
      composeHistoryLabel(
        {
          display_name: 'Berlin',
          address: { suburb: 'Mitte', city: 'Berlin' },
        },
        FALLBACK,
      ),
    ).toBe('Mitte, Berlin');
  });

  it('uses bare city when only city is reported', () => {
    expect(
      composeHistoryLabel(
        {
          display_name: '',
          address: { city: 'München' },
        },
        FALLBACK,
      ),
    ).toBe('München');
  });

  it('returns the fallback (lat/lng) when Nominatim returned nothing', () => {
    expect(
      composeHistoryLabel(
        { display_name: '', address: {} },
        FALLBACK,
      ),
    ).toBe(FALLBACK);
  });

  it('uses display_name segments before falling back to coords', () => {
    expect(
      composeHistoryLabel(
        { display_name: 'Some Place, Hessen, Germany' },
        FALLBACK,
      ),
    ).toBe('Some Place, Hessen, Germany');
  });
});
