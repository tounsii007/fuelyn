// @vitest-environment jsdom

// ============================================================
// formatReverseLabel — exhaustive coverage of every Nominatim
// response shape we can plausibly hit.
// ============================================================

import { describe, it, expect } from 'vitest';
import { formatReverseLabel } from '../stations/AddressSearch';

describe('formatReverseLabel', () => {
  it('renders the full address when road + house_number + postcode + city are present', () => {
    const out = formatReverseLabel({
      display_name: 'Hauptstraße 12, 35037 Marburg, Hessen, Deutschland',
      address: {
        road: 'Hauptstraße',
        house_number: '12',
        postcode: '35037',
        city: 'Marburg',
      },
    });
    expect(out).toBe('Hauptstraße 12, 35037 Marburg');
  });

  it('omits house_number when not provided but keeps street name', () => {
    expect(
      formatReverseLabel({
        display_name: 'Hauptstraße, Marburg',
        address: {
          road: 'Hauptstraße',
          postcode: '35037',
          city: 'Marburg',
        },
      }),
    ).toBe('Hauptstraße, 35037 Marburg');
  });

  it('falls back to road + city when postcode is missing', () => {
    expect(
      formatReverseLabel({
        display_name: 'Test',
        address: {
          road: 'Hauptstraße',
          city: 'Marburg',
        },
      }),
    ).toBe('Hauptstraße, Marburg');
  });

  it('falls back to postcode + city when road is missing (the screenshot case)', () => {
    expect(
      formatReverseLabel({
        display_name: 'Marburg, Hessen, Germany',
        address: {
          postcode: '35037',
          city: 'Marburg',
        },
      }),
    ).toBe('35037 Marburg');
  });

  it('uses suburb + city for park / unnamed-road pins', () => {
    expect(
      formatReverseLabel({
        display_name: 'Berlin, Germany',
        address: {
          suburb: 'Mitte',
          city: 'Berlin',
        },
      }),
    ).toBe('Mitte, Berlin');
  });

  it('treats town/village/municipality as fallback city-likes', () => {
    expect(
      formatReverseLabel({
        display_name: 'Foo',
        address: { road: 'Dorfstraße', village: 'Klein-Erlitz' },
      }),
    ).toBe('Dorfstraße, Klein-Erlitz');
  });

  it('last resort: trims display_name to first 3 segments', () => {
    expect(
      formatReverseLabel({
        display_name: 'Some, Random, Place, On, Earth',
      }),
    ).toBe('Some, Random, Place');
  });

  it('handles a pin with only road + house_number (no city)', () => {
    expect(
      formatReverseLabel({
        display_name: 'X',
        address: { road: 'Hauptstraße', house_number: '12' },
      }),
    ).toBe('Hauptstraße 12');
  });
});
