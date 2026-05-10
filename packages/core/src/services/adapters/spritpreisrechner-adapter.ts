// ============================================================
// Spritpreisrechner-Adapter (Austria)
//
// Wraps the open-data API at https://api.e-control.at/sprit/
// — Austria's official price-comparison feed (E-Control).
//
// Endpoints:
//   GET /1.0/search/gas-stations/by-address?latitude=&longitude=&fuelType=
//
// fuelType mapping (de/at terminology vs ours):
//   DIE → diesel
//   SUP → e5  (Super 95)
//   GAS → e10 (Super E10)  — note: in AT, "GAS" actually means LPG;
//                            we DO NOT remap. Pure E10 isn't always
//                            available so we surface it as "no price"
//                            rather than silently swap.
//
// Pure-data adapter: takes a `fetch` impl so it can be tested
// without network and used SSR or in browser identically.
// ============================================================

import type { UnifiedFuelStation } from '../../domain/unified-station';
import type { FuelType } from '../../domain/types';
import type { DataSourceAdapter, SearchArea, AdapterSearchResult } from './adapter-types';

interface SpritStation {
  id: number;
  name: string;
  location: {
    address: string;
    postalCode: string;
    city: string;
    latitude: number;
    longitude: number;
  };
  open?: boolean;
  prices?: Array<{ fuelType: 'DIE' | 'SUP' | 'GAS'; amount: number }>;
}

const E_CONTROL_FUEL: Record<FuelType, 'DIE' | 'SUP'> = {
  diesel: 'DIE',
  e5: 'SUP',
  e10: 'SUP', // E-Control doesn't expose E10 specifically; use SUP as best proxy
};

const BASE_URL = 'https://api.e-control.at/sprit/1.0';

export interface SpritpreisrechnerAdapterConfig {
  fetchImpl?: typeof fetch;
  fuelType: FuelType;
}

export class SpritpreisrechnerAdapter implements DataSourceAdapter<UnifiedFuelStation> {
  readonly sourceId = 'spritpreisrechner-at';
  readonly stationType = 'fuel' as const;

  private readonly fetchImpl: typeof fetch;
  private readonly fuelType: FuelType;

  constructor(config: SpritpreisrechnerAdapterConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.fuelType = config.fuelType;
  }

  async search(area: SearchArea, signal?: AbortSignal): Promise<AdapterSearchResult<UnifiedFuelStation>> {
    const url = new URL(`${BASE_URL}/search/gas-stations/by-address`);
    url.searchParams.set('latitude', String(area.lat));
    url.searchParams.set('longitude', String(area.lng));
    url.searchParams.set('fuelType', E_CONTROL_FUEL[this.fuelType]);
    url.searchParams.set('includeClosed', 'false');

    try {
      const res = await this.fetchImpl(url.toString(), { signal });
      if (!res.ok) {
        return { stations: [], source: this.sourceId, error: `HTTP ${res.status}` };
      }
      const json = (await res.json()) as SpritStation[] | { stations?: SpritStation[] };
      const list: SpritStation[] = Array.isArray(json) ? json : (json.stations ?? []);

      const stations = list
        .map((s) => mapToUnified(s, area, this.fuelType))
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

export function mapToUnified(
  s: SpritStation,
  origin: SearchArea,
  requestedFuel: FuelType,
): UnifiedFuelStation | null {
  if (typeof s.location?.latitude !== 'number' || typeof s.location?.longitude !== 'number') {
    return null;
  }
  const dist = haversineKm(origin.lat, origin.lng, s.location.latitude, s.location.longitude);
  const priceAt = s.prices?.find((p) => p.fuelType === E_CONTROL_FUEL[requestedFuel])?.amount ?? null;

  return {
    id: `at-${s.id}`,
    name: s.name,
    brand: extractBrand(s.name),
    lat: s.location.latitude,
    lng: s.location.longitude,
    dist,
    address: {
      street: s.location.address ?? '',
      houseNumber: '',
      postCode: s.location.postalCode ?? '',
      city: s.location.city ?? '',
    },
    isOpen: s.open ?? true,
    stationType: 'fuel',
    energyTypes: ['diesel', 'e5'],
    prices: {
      diesel: requestedFuel === 'diesel' ? priceAt : null,
      e5: requestedFuel === 'e5' || requestedFuel === 'e10' ? priceAt : null,
      e10: null,
    },
    source: 'spritpreisrechner-at',
    countryCode: 'AT',
  };
}

function extractBrand(name: string): string {
  // Heuristic: most station names start with the brand ("OMV Wien Schwechat").
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first;
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
