// ============================================================
// OsservaPrezzi-Adapter (Italy)
//
// Wraps the open-data CSV feed from Italy's Ministero dello
// Sviluppo Economico (MISE / MIMIT) at:
//   https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv
//   https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv
//
// Both files are cached daily on the ministry side. We don't
// fetch them per-request — the deployment is expected to mirror
// them server-side (cron) and pass an in-memory snapshot via the
// `dataLoader` callback. This keeps the adapter offline-first
// and predictable.
//
// Fuel-type mapping (IT codes ↔ ours):
//   Benzina            → e5
//   Gasolio            → diesel
//   Gasolio Premium    → diesel  (premium variant; we collapse to diesel)
//   Gas Naturale / GPL → IGNORED (not in our 3-tier model)
// ============================================================

import type { UnifiedFuelStation } from '../../domain/unified-station';
import type { DataSourceAdapter, SearchArea, AdapterSearchResult } from './adapter-types';

export interface ItStationRow {
  id: string;
  name: string;
  brand: string;
  lat: number;
  lng: number;
  street: string;
  city: string;
  province: string;
  prices: { benzina?: number | null; gasolio?: number | null };
}

export type OsservaPrezziDataLoader = () => Promise<readonly ItStationRow[]>;

export interface OsservaPrezziAdapterConfig {
  /** Server-side mirror of the MIMIT CSV feed; called once per search. */
  dataLoader: OsservaPrezziDataLoader;
}

export class OsservaPrezziAdapter implements DataSourceAdapter<UnifiedFuelStation> {
  readonly sourceId = 'osservaprezzi-it';
  readonly stationType = 'fuel' as const;

  private readonly dataLoader: OsservaPrezziDataLoader;

  constructor(config: OsservaPrezziAdapterConfig) {
    this.dataLoader = config.dataLoader;
  }

  async search(area: SearchArea): Promise<AdapterSearchResult<UnifiedFuelStation>> {
    try {
      const all = await this.dataLoader();
      const r2 = area.radiusKm * area.radiusKm;
      const stations: UnifiedFuelStation[] = [];
      for (const row of all) {
        const dKm = haversineKm(area.lat, area.lng, row.lat, row.lng);
        if (dKm * dKm > r2) continue;
        stations.push({
          id: `it-${row.id}`,
          name: row.name,
          brand: row.brand,
          lat: row.lat,
          lng: row.lng,
          dist: dKm,
          address: { street: row.street, houseNumber: '', postCode: '', city: row.city },
          isOpen: true,
          stationType: 'fuel',
          energyTypes: ['diesel', 'e5'],
          prices: {
            diesel: row.prices.gasolio ?? null,
            e5: row.prices.benzina ?? null,
            e10: null, // E10 not standardly available in IT
          },
          source: 'osservaprezzi-it',
          countryCode: 'IT',
        });
      }
      // Sort closest first.
      stations.sort((a, b) => a.dist - b.dist);
      return { stations: stations.slice(0, 100), source: this.sourceId };
    } catch (err) {
      return {
        stations: [],
        source: this.sourceId,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

/** Parse the MIMIT anagrafica + prezzi CSVs into ItStationRow rows. */
export function parseMimitCsv(
  anagraficaCsv: string,
  prezziCsv: string,
): ItStationRow[] {
  const anaLines = anagraficaCsv.split(/\r?\n/);
  const priceLines = prezziCsv.split(/\r?\n/);
  // First line of each MIMIT file is "Estrazione del …", real
  // header is on the second line.
  const anaRows = anaLines.slice(2).filter(Boolean);
  const priceRows = priceLines.slice(2).filter(Boolean);

  // Build price index: stationId → { benzina, gasolio }
  const priceIdx = new Map<string, { benzina?: number; gasolio?: number }>();
  for (const line of priceRows) {
    const cells = line.split(';');
    const id = cells[0];
    const desc = cells[1]?.trim();
    const value = Number((cells[2] ?? '').replace(',', '.'));
    if (!id || !desc || !Number.isFinite(value) || value <= 0) continue;
    const cur = priceIdx.get(id) ?? {};
    if (desc === 'Benzina') cur.benzina = value;
    else if (desc.startsWith('Gasolio')) cur.gasolio = value;
    priceIdx.set(id, cur);
  }

  const out: ItStationRow[] = [];
  for (const line of anaRows) {
    const cells = line.split(';');
    if (cells.length < 10) continue;
    const id = cells[0]!;
    const lat = Number(cells[8]?.replace(',', '.'));
    const lng = Number(cells[9]?.replace(',', '.'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const prices = priceIdx.get(id) ?? {};
    out.push({
      id,
      name: cells[1] ?? '',
      brand: cells[2] ?? '',
      lat,
      lng,
      street: cells[5] ?? '',
      city: cells[6] ?? '',
      province: cells[7] ?? '',
      prices,
    });
  }
  return out;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
