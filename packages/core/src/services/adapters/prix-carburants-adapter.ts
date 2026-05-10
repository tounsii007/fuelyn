// ============================================================
// Prix-Carburants-Adapter (France)
//
// Wraps the open-data API at:
//   https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/
//   prix-carburants-fichier-instantane-test-ods-copie/records
//
// French public data published by the Ministère de l'Économie,
// updated nightly. Free, no API key.
//
// Fuel-type mapping (FR official codes ↔ ours):
//   Gazole       → diesel
//   SP95         → e5  (regular gasoline)
//   SP95-E10     → e10 (10 % ethanol blend)
//   SP98         → e5  (premium, treated as e5 for our 3-tier model)
//
// We always pull all four prices in one request, so the adapter
// returns ALL fuel prices on each station — the caller just picks
// what they need.
// ============================================================

import type { UnifiedFuelStation } from '../../domain/unified-station';
import type { DataSourceAdapter, SearchArea, AdapterSearchResult } from './adapter-types';

interface PrixRecord {
  id: string;
  geom?: { lat: number; lon: number };
  cp?: string;
  ville?: string;
  adresse?: string;
  prix?: Array<{ '@nom': string; '@valeur': string }>;
  horaires?: { jour?: Array<{ '@nom': string; '@ouverture'?: string; '@fermeture'?: string }> };
}

interface OdsResponse {
  results: Array<{ record: { fields: PrixRecord } } | PrixRecord>;
}

const BASE_URL =
  'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/' +
  'prix-carburants-fichier-instantane-test-ods-copie/records';

export interface PrixCarburantsAdapterConfig {
  fetchImpl?: typeof fetch;
}

export class PrixCarburantsAdapter implements DataSourceAdapter<UnifiedFuelStation> {
  readonly sourceId = 'prix-carburants-fr';
  readonly stationType = 'fuel' as const;

  private readonly fetchImpl: typeof fetch;
  constructor(config: PrixCarburantsAdapterConfig = {}) {
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async search(area: SearchArea, signal?: AbortSignal): Promise<AdapterSearchResult<UnifiedFuelStation>> {
    // ODS API quirk: distance() returns metres; we ask for the
    // closest 100 stations within radius and post-filter.
    const url = new URL(BASE_URL);
    const radiusM = Math.round(area.radiusKm * 1000);
    url.searchParams.set('limit', '100');
    url.searchParams.set(
      'where',
      `distance(geom, geom'POINT(${area.lng} ${area.lat})', ${radiusM}m)`,
    );
    url.searchParams.set('order_by', `distance(geom, geom'POINT(${area.lng} ${area.lat})')`);

    try {
      const res = await this.fetchImpl(url.toString(), { signal });
      if (!res.ok) {
        return { stations: [], source: this.sourceId, error: `HTTP ${res.status}` };
      }
      const json = (await res.json()) as OdsResponse;
      const list: PrixRecord[] = (json.results ?? []).map((r) =>
        'record' in r ? r.record.fields : r,
      );
      const stations = list
        .map((r) => mapToUnified(r, area))
        .filter((s): s is UnifiedFuelStation => s != null);
      return { stations, source: this.sourceId };
    } catch (err) {
      return {
        stations: [],
        source: this.sourceId,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

export function mapToUnified(r: PrixRecord, origin: SearchArea): UnifiedFuelStation | null {
  const lat = r.geom?.lat;
  const lng = r.geom?.lon;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const dist = haversineKm(origin.lat, origin.lng, lat, lng);

  let diesel: number | null = null;
  let e5: number | null = null;
  let e10: number | null = null;
  for (const p of r.prix ?? []) {
    const value = Number(p['@valeur']);
    if (!Number.isFinite(value) || value <= 0) continue;
    switch (p['@nom']) {
      case 'Gazole':
        diesel = value;
        break;
      case 'SP95':
      case 'SP98':
        if (e5 == null) e5 = value;
        break;
      case 'SP95-E10':
        e10 = value;
        break;
    }
  }

  return {
    id: `fr-${r.id}`,
    name: r.adresse ? r.adresse : `Station ${r.id}`,
    brand: '', // FR open data doesn't expose brand consistently
    lat,
    lng,
    dist,
    address: {
      street: r.adresse ?? '',
      houseNumber: '',
      postCode: r.cp ?? '',
      city: r.ville ?? '',
    },
    isOpen: true, // optional horaires omitted for simplicity
    stationType: 'fuel',
    energyTypes: ['diesel', 'e5', 'e10'],
    prices: { diesel, e5, e10 },
    source: 'prix-carburants-fr',
    countryCode: 'FR',
  };
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
