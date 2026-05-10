// ============================================================
// Multi-country adapter tests (AT / FR / IT).
// All three use injectable transports so no network is touched.
// ============================================================

import { describe, it, expect } from 'vitest';
import { SpritpreisrechnerAdapter } from '../spritpreisrechner-adapter';
import { PrixCarburantsAdapter } from '../prix-carburants-adapter';
import { OsservaPrezziAdapter, parseMimitCsv } from '../osservaprezzi-adapter';

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response;
}

describe('SpritpreisrechnerAdapter — Austria', () => {
  it('returns mapped UnifiedFuelStation rows for diesel', async () => {
    const fakeFetch = (async () =>
      jsonResponse([
        {
          id: 1,
          name: 'OMV Wien Schwechat',
          location: { address: 'Flughafenstraße 1', postalCode: '1300', city: 'Schwechat', latitude: 48.110, lng: undefined, longitude: 16.560 },
          open: true,
          prices: [{ fuelType: 'DIE', amount: 1.589 }],
        },
      ])) as typeof fetch;

    const adapter = new SpritpreisrechnerAdapter({ fetchImpl: fakeFetch, fuelType: 'diesel' });
    const result = await adapter.search({ lat: 48.0, lng: 16.5, radiusKm: 25 });
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0]?.brand).toBe('OMV');
    expect(result.stations[0]?.prices.diesel).toBeCloseTo(1.589, 3);
    expect(result.stations[0]?.countryCode).toBe('AT');
    expect(result.stations[0]?.source).toBe('spritpreisrechner-at');
  });

  it('forwards HTTP errors as adapter error', async () => {
    const fakeFetch = (async () => jsonResponse({}, false)) as typeof fetch;
    const adapter = new SpritpreisrechnerAdapter({ fetchImpl: fakeFetch, fuelType: 'e5' });
    const result = await adapter.search({ lat: 48, lng: 16, radiusKm: 10 });
    expect(result.stations).toHaveLength(0);
    expect(result.error).toMatch(/HTTP/);
  });

  it('skips rows missing coordinates', async () => {
    const fakeFetch = (async () =>
      jsonResponse([
        {
          id: 2,
          name: 'Broken Station',
          location: { address: 'X', postalCode: '0', city: 'X', latitude: null, longitude: null },
          prices: [],
        },
      ])) as typeof fetch;
    const adapter = new SpritpreisrechnerAdapter({ fetchImpl: fakeFetch, fuelType: 'diesel' });
    const result = await adapter.search({ lat: 48, lng: 16, radiusKm: 10 });
    expect(result.stations).toHaveLength(0);
  });
});

describe('PrixCarburantsAdapter — France', () => {
  it('maps Gazole and SP95-E10 prices', async () => {
    const fakeFetch = (async () =>
      jsonResponse({
        results: [
          {
            id: '67000001',
            geom: { lat: 48.5734, lon: 7.7521 },
            adresse: '12 rue Truc',
            cp: '67000',
            ville: 'Strasbourg',
            prix: [
              { '@nom': 'Gazole', '@valeur': '1.689' },
              { '@nom': 'SP95-E10', '@valeur': '1.799' },
              { '@nom': 'SP95', '@valeur': '1.829' },
            ],
          },
        ],
      })) as typeof fetch;
    const adapter = new PrixCarburantsAdapter({ fetchImpl: fakeFetch });
    const result = await adapter.search({ lat: 48.57, lng: 7.75, radiusKm: 25 });
    expect(result.stations).toHaveLength(1);
    const s = result.stations[0]!;
    expect(s.prices.diesel).toBeCloseTo(1.689, 3);
    expect(s.prices.e10).toBeCloseTo(1.799, 3);
    expect(s.prices.e5).toBeCloseTo(1.829, 3);
    expect(s.countryCode).toBe('FR');
  });

  it('drops zero / non-finite price rows silently', async () => {
    const fakeFetch = (async () =>
      jsonResponse({
        results: [
          {
            id: 'X',
            geom: { lat: 48, lon: 7 },
            prix: [{ '@nom': 'Gazole', '@valeur': '0' }, { '@nom': 'SP95', '@valeur': 'foo' }],
          },
        ],
      })) as typeof fetch;
    const adapter = new PrixCarburantsAdapter({ fetchImpl: fakeFetch });
    const result = await adapter.search({ lat: 48, lng: 7, radiusKm: 10 });
    expect(result.stations[0]?.prices.diesel).toBeNull();
    expect(result.stations[0]?.prices.e5).toBeNull();
  });
});

describe('OsservaPrezziAdapter — Italy', () => {
  it('filters by radius and sorts by distance', async () => {
    const dataLoader = async () => [
      { id: '1', name: 'Eni Roma 1', brand: 'Eni', lat: 41.900, lng: 12.500, street: 'Via 1', city: 'Roma', province: 'RM', prices: { gasolio: 1.799, benzina: 1.899 } },
      { id: '2', name: 'Q8 Milano',  brand: 'Q8',  lat: 45.464, lng: 9.190, street: 'Via 2', city: 'Milano', province: 'MI', prices: { gasolio: 1.789, benzina: 1.889 } },
    ];
    const adapter = new OsservaPrezziAdapter({ dataLoader });
    const result = await adapter.search({ lat: 41.91, lng: 12.49, radiusKm: 25 });
    expect(result.stations).toHaveLength(1);
    expect(result.stations[0]?.brand).toBe('Eni');
    expect(result.stations[0]?.countryCode).toBe('IT');
  });

  it('handles loader errors gracefully', async () => {
    const dataLoader = async () => { throw new Error('mirror down'); };
    const adapter = new OsservaPrezziAdapter({ dataLoader });
    const result = await adapter.search({ lat: 41, lng: 12, radiusKm: 10 });
    expect(result.error).toMatch(/mirror down/);
  });
});

describe('parseMimitCsv', () => {
  it('parses anagrafica + prezzi CSVs into joined rows', () => {
    const ana = [
      'Estrazione del 2026-05-10',
      'idImpianto;Gestore;Bandiera;TipoImpianto;Nome;Indirizzo;Comune;Provincia;Latitudine;Longitudine',
      '12345;Pinco;Eni;Stradale;Eni Roma;Via Test 1;Roma;RM;41,900;12,500',
    ].join('\n');
    const prezzi = [
      'Estrazione del 2026-05-10',
      'idImpianto;descCarburante;prezzo;isSelf;dtComu',
      '12345;Benzina;1,899;1;2026-05-10',
      '12345;Gasolio;1,799;1;2026-05-10',
    ].join('\n');
    const rows = parseMimitCsv(ana, prezzi);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.brand).toBe('Eni');
    expect(rows[0]?.lat).toBeCloseTo(41.9, 3);
    expect(rows[0]?.prices.gasolio).toBeCloseTo(1.799, 3);
    expect(rows[0]?.prices.benzina).toBeCloseTo(1.899, 3);
  });
});
