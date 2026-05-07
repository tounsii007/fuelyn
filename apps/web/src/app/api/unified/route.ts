// ============================================================
// BFF - /api/unified
// Proxies unified station search to Java Price Service (via Gateway).
// Falls back to direct API calls if backend unavailable.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, BackendApiError } from '@/lib/api/backend-client';
import {
  ApiClient,
  StationService,
  API_BASE_URL,
  mapStationsToUnified,
  searchH2Stations,
  searchGasStations,
} from '@fuelyn/core';
import type { FuelType, EnergyType, UnifiedStation } from '@fuelyn/core';

const client = new ApiClient({ baseUrl: API_BASE_URL });
const service = new StationService({
  client,
  apiKey: process.env.TANKERKOENIG_API_KEY,
});

function parseFiniteNumber(value: string | null): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseEnergyTypes(param: string | null): EnergyType[] {
  if (!param) return ['diesel', 'e5', 'e10'];
  return param.split(',').filter((t): t is EnergyType =>
    ['diesel', 'e5', 'e10', 'super_plus', 'lpg', 'cng', 'lng', 'h2', 'ev_ac', 'ev_dc', 'ev_hpc'].includes(t),
  );
}

function pickTankerkoenigFuelType(energyTypes: EnergyType[]): FuelType | null {
  const tk: FuelType[] = [];
  if (energyTypes.includes('diesel')) tk.push('diesel');
  if (energyTypes.includes('e5') || energyTypes.includes('super_plus')) tk.push('e5');
  if (energyTypes.includes('e10')) tk.push('e10');
  return tk[0] ?? (energyTypes.some((t) => ['diesel', 'e5', 'e10', 'super_plus'].includes(t)) ? 'e10' : null);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const lat = parseFiniteNumber(searchParams.get('lat'));
  const lng = parseFiniteNumber(searchParams.get('lng'));
  const rad = parseFiniteNumber(searchParams.get('rad')) ?? 10;
  const energyTypes = parseEnergyTypes(searchParams.get('types'));
  const sortParam = searchParams.get('sort') ?? 'dist';

  if (lat == null || lng == null) {
    return NextResponse.json(
      { error: 'Missing or invalid lat/lng parameters' },
      { status: 400 },
    );
  }

  const needsH2 = energyTypes.includes('h2');
  const needsGas = energyTypes.some((t) => ['lpg', 'cng', 'lng'].includes(t));

  // Try Java backend for fuel + EV stations
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      rad: String(Math.min(rad, 50)),
      types: energyTypes.filter((t) => !['h2', 'lpg', 'cng', 'lng'].includes(t)).join(','),
      sort: sortParam,
    });

    const result = await backendFetch<{ success: boolean; data: { stations: UnifiedStation[] } }>(
      `/api/v1/prices/unified?${params.toString()}`,
    );

    if (result.success && result.data) {
      // Normalize stations from Java backend to match frontend types
      const normalized = (result.data.stations ?? []).map((s) => {
        const raw = s as unknown as Record<string, unknown>;
        // Ensure fuel stations have nested prices object
        if (raw.stationType === 'fuel' && !raw.prices) {
          raw.prices = {
            diesel: raw.diesel ?? null,
            e5: raw.e5 ?? null,
            e10: raw.e10 ?? null,
          };
        }
        // Ensure address is an object
        if (typeof raw.address === 'string' || !raw.address) {
          raw.address = {
            street: (typeof raw.address === 'string' ? raw.address : raw.street) ?? '',
            houseNumber: raw.houseNumber ?? '',
            postCode: raw.postCode ?? '',
            city: raw.city ?? raw.place ?? '',
          };
        }
        return raw as unknown as UnifiedStation;
      });
      const allStations: UnifiedStation[] = [...normalized];

      // H2 + Gas are static datasets, add client-side
      if (needsH2) allStations.push(...(searchH2Stations(lat, lng, rad) as UnifiedStation[]));
      if (needsGas) {
        const gasTypes = energyTypes.filter(
          (t): t is 'lpg' | 'cng' | 'lng' => t === 'lpg' || t === 'cng' || t === 'lng',
        );
        allStations.push(...(searchGasStations(lat, lng, rad, gasTypes) as UnifiedStation[]));
      }

      if (sortParam === 'dist') allStations.sort((a, b) => a.dist - b.dist);

      return NextResponse.json({ stations: allStations }, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      });
    }
  } catch (error) {
    console.warn(
      '[BFF] Java backend unavailable for unified, falling back:',
      error instanceof BackendApiError ? `${error.status} ${error.message}` : error,
    );
  }

  // Fallback: direct API calls (same as before)
  const needsFuel = energyTypes.some((t) => ['diesel', 'e5', 'e10', 'super_plus'].includes(t));
  const needsCharging = energyTypes.some((t) => ['ev_ac', 'ev_dc', 'ev_hpc'].includes(t));

  const promises: Promise<UnifiedStation[]>[] = [];

  if (needsFuel && process.env.TANKERKOENIG_API_KEY) {
    const fuelType = pickTankerkoenigFuelType(energyTypes);
    if (fuelType) {
      promises.push(
        service
          .searchStations({ lat, lng, radiusKm: Math.min(rad, 25), fuelType, sort: sortParam === 'price' ? 'price' : 'dist' })
          .then((stations): UnifiedStation[] => mapStationsToUnified(stations))
          .catch((): UnifiedStation[] => []),
      );
    }
  }

  if (needsCharging) {
    const { mapChargingStationsToUnified } = await import('@fuelyn/core');
    const OCM_BASE = 'https://api.openchargemap.io/v3/poi';
    const params = new URLSearchParams({
      output: 'json', latitude: String(lat), longitude: String(lng),
      distance: String(Math.min(rad, 100)), distanceunit: 'KM', maxresults: '100',
      compact: 'true', verbose: 'false', countrycode: 'DE',
    });
    const apiKey = process.env.OPENCHARGEMAP_API_KEY;
    if (apiKey) params.set('key', apiKey);

    promises.push(
      fetch(`${OCM_BASE}?${params}`, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'Fuelyn/1.0' } })
        .then((r) => r.json())
        .then((raw) => {
          const stations = (raw as Array<Record<string, unknown>>)
            .filter((r: Record<string, unknown>) => (r.AddressInfo as Record<string, unknown>)?.Latitude)
            .map((r: Record<string, unknown>) => {
              const addr = r.AddressInfo as Record<string, unknown>;
              return {
                id: String(r.ID), name: (addr.Title as string) || 'Ladestation',
                operator: ((r.OperatorInfo as Record<string, unknown>)?.Title as string) || 'Unbekannt',
                lat: addr.Latitude as number, lng: addr.Longitude as number,
                dist: (addr.Distance as number) ?? 0, address: (addr.AddressLine1 as string) || '',
                city: (addr.Town as string) || '', postCode: (addr.Postcode as string) || '',
                connections: ((r.Connections as Array<Record<string, unknown>>) || []).map((c) => ({
                  type: String((c.ConnectionType as Record<string, unknown>)?.Title || `Typ ${c.ConnectionTypeID}`),
                  powerKW: (c.PowerKW as number) ?? null, quantity: (c.Quantity as number) ?? 1,
                })),
                isOperational: (r.StatusType as Record<string, unknown>)?.IsOperational !== false,
                usageCost: (r.UsageCost as string) || null,
                accessType: ((r.UsageType as Record<string, unknown>)?.Title as string) || null,
              };
            });
          return mapChargingStationsToUnified(stations);
        })
        .catch((): UnifiedStation[] => []),
    );
  }

  if (needsH2) promises.push(Promise.resolve(searchH2Stations(lat, lng, rad) as UnifiedStation[]));
  if (needsGas) {
    const gasTypes = energyTypes.filter((t): t is 'lpg' | 'cng' | 'lng' => ['lpg', 'cng', 'lng'].includes(t));
    promises.push(Promise.resolve(searchGasStations(lat, lng, rad, gasTypes) as UnifiedStation[]));
  }

  try {
    const results = await Promise.allSettled(promises);
    const allStations: UnifiedStation[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') allStations.push(...result.value);
    }
    if (sortParam === 'dist') allStations.sort((a, b) => a.dist - b.dist);

    return NextResponse.json({ stations: allStations }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('[BFF] Unified search failed:', error);
    return NextResponse.json({ error: 'Failed to fetch stations' }, { status: 502 });
  }
}
