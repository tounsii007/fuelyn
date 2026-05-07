// ============================================================
// Fuelyn Web — Station Data Hooks (TanStack Query)
// ============================================================

'use client';

import { useQuery } from '@tanstack/react-query';
import type { Station, StationDetail, FuelType } from '@fuelyn/core';
import {
  STALE_TIME_LIST_MS,
  STALE_TIME_PRICES_MS,
  REFETCH_INTERVAL_PRICES_MS,
} from '@fuelyn/core';
import { fetchJson } from '../http/fetch-json';

// ─── API Fetchers (call our BFF routes, not Tankerkönig directly) ─

async function fetchStations(params: {
  lat: number;
  lng: number;
  rad: number;
  type: FuelType;
  sort: 'price' | 'dist';
  signal?: AbortSignal;
}): Promise<Station[]> {
  const qs = new URLSearchParams({
    lat: String(params.lat),
    lng: String(params.lng),
    rad: String(params.rad),
    type: params.type,
    sort: params.sort,
  });

  const data = await fetchJson<{ stations?: Station[] }>(`/api/stations?${qs}`, {
    signal: params.signal,
  });
  if (!Array.isArray(data.stations)) {
    throw new Error('Station fetch returned an invalid payload');
  }
  return data.stations;
}

async function fetchStationDetail(id: string, signal?: AbortSignal): Promise<StationDetail> {
  const data = await fetchJson<{ station?: StationDetail }>(`/api/stations/${id}`, {
    signal,
  });
  if (!data.station) {
    throw new Error('Detail fetch returned an invalid payload');
  }
  return data.station;
}

interface PriceUpdateEntry {
  stationId: string;
  prices: { diesel: number | null; e5: number | null; e10: number | null };
  status: string;
}

async function fetchPrices(ids: string[], signal?: AbortSignal): Promise<PriceUpdateEntry[]> {
  const data = await fetchJson<{ prices?: PriceUpdateEntry[] }>(`/api/prices?ids=${ids.join(',')}`, {
    signal,
  });
  if (!Array.isArray(data.prices)) {
    throw new Error('Price fetch returned an invalid payload');
  }
  return data.prices;
}

// ─── Grid helpers for wide-area search ──────────────────────

/** Max API radius per request (Tankerkoenig limit). */
const MAX_API_RADIUS_KM = 25;

/**
 * Max grid points for dynamic grids (medium zoom).
 * For Germany-wide, a predefined grid is used instead.
 */
const MAX_DYNAMIC_GRID = 16;

/** Threshold (km): above this radius, use the Germany-wide grid. */
const GERMANY_WIDE_THRESHOLD_KM = 200;

interface GridPoint {
  lat: number;
  lng: number;
  rad: number;
}

/**
 * Pre-defined grid covering all of Germany.
 * 30 strategic points with 25km radius each, spaced ~80km apart.
 * Covers major population areas: North (Hamburg, Kiel, Rostock),
 * East (Berlin, Dresden, Leipzig), South (München, Stuttgart,
 * Nürnberg), West (Köln, Düsseldorf, Frankfurt), Center (Hannover,
 * Kassel, Erfurt) and everything in between.
 */
const GERMANY_GRID: GridPoint[] = [
  // Row 1: North coast (lat ~54.5)
  { lat: 54.5, lng: 8.5, rad: 25 },   // Schleswig-Holstein West
  { lat: 54.3, lng: 10.1, rad: 25 },  // Kiel
  { lat: 54.1, lng: 12.1, rad: 25 },  // Rostock

  // Row 2: North (lat ~53.5)
  { lat: 53.6, lng: 7.0, rad: 25 },   // Ostfriesland
  { lat: 53.5, lng: 9.9, rad: 25 },   // Hamburg
  { lat: 53.4, lng: 11.8, rad: 25 },  // Schwerin
  { lat: 53.4, lng: 13.4, rad: 25 },  // Neubrandenburg

  // Row 3: North-Central (lat ~52.5)
  { lat: 52.5, lng: 7.5, rad: 25 },   // Osnabrück
  { lat: 52.4, lng: 9.7, rad: 25 },   // Hannover
  { lat: 52.3, lng: 11.6, rad: 25 },  // Magdeburg
  { lat: 52.5, lng: 13.4, rad: 25 },  // Berlin

  // Row 4: Central (lat ~51.5)
  { lat: 51.9, lng: 6.8, rad: 25 },   // Duisburg/Essen
  { lat: 51.5, lng: 8.5, rad: 25 },   // Paderborn
  { lat: 51.3, lng: 9.5, rad: 25 },   // Kassel
  { lat: 51.3, lng: 12.4, rad: 25 },  // Leipzig
  { lat: 51.1, lng: 14.0, rad: 25 },  // Cottbus/Görlitz

  // Row 5: Central-South (lat ~50.5)
  { lat: 50.9, lng: 6.9, rad: 25 },   // Köln/Bonn
  { lat: 50.6, lng: 8.7, rad: 25 },   // Gießen
  { lat: 50.9, lng: 11.0, rad: 25 },  // Erfurt
  { lat: 51.0, lng: 13.7, rad: 25 },  // Dresden

  // Row 6: South-Central (lat ~49.5-50)
  { lat: 50.1, lng: 8.7, rad: 25 },   // Frankfurt
  { lat: 49.8, lng: 6.6, rad: 25 },   // Trier
  { lat: 49.5, lng: 11.0, rad: 25 },  // Nürnberg
  { lat: 49.8, lng: 12.9, rad: 25 },  // Bayerischer Wald

  // Row 7: South (lat ~48.5-49)
  { lat: 49.0, lng: 8.4, rad: 25 },   // Karlsruhe
  { lat: 48.8, lng: 9.2, rad: 25 },   // Stuttgart
  { lat: 48.4, lng: 10.0, rad: 25 },  // Ulm
  { lat: 48.1, lng: 11.6, rad: 25 },  // München

  // Row 8: Far South (lat ~47.5-48)
  { lat: 47.7, lng: 8.5, rad: 25 },   // Bodensee
  { lat: 47.9, lng: 13.0, rad: 25 },  // Salzburg-Grenze
];

/**
 * Generate search grid based on visible map area.
 * - Small radius (≤25km): single API call
 * - Medium radius (25–200km): dynamic grid of up to 16 points
 * - Large radius (>200km / Germany-wide): pre-defined 30-point grid
 */
function computeSearchGrid(
  centerLat: number,
  centerLng: number,
  radiusKm: number,
): GridPoint[] {
  // Single request for small areas
  if (radiusKm <= MAX_API_RADIUS_KM) {
    return [{ lat: centerLat, lng: centerLng, rad: radiusKm }];
  }

  // Germany-wide grid for very large areas
  if (radiusKm >= GERMANY_WIDE_THRESHOLD_KM) {
    return GERMANY_GRID;
  }

  // Dynamic grid for medium areas
  const stepKm = 40;
  const latStep = stepKm / 111.32;
  const lngStep = stepKm / (111.32 * Math.cos((centerLat * Math.PI) / 180));

  const stepsNeeded = Math.ceil(radiusKm / stepKm);
  const maxStepsPerAxis = Math.floor(Math.sqrt(MAX_DYNAMIC_GRID));
  const steps = Math.min(stepsNeeded, maxStepsPerAxis);

  const points: GridPoint[] = [];
  const halfSteps = (steps - 1) / 2;

  for (let row = 0; row < steps; row++) {
    for (let col = 0; col < steps; col++) {
      if (points.length >= MAX_DYNAMIC_GRID) break;
      points.push({
        lat: centerLat + (row - halfSteps) * latStep,
        lng: centerLng + (col - halfSteps) * lngStep,
        rad: MAX_API_RADIUS_KM,
      });
    }
  }

  return points;
}

/**
 * Fetch in batches to avoid overwhelming the API.
 * Processes BATCH_SIZE requests concurrently, then next batch.
 */
const BATCH_SIZE = 5;

async function fetchBatched(
  grid: GridPoint[],
  type: FuelType,
  sort: 'price' | 'dist',
  signal?: AbortSignal,
): Promise<Station[][]> {
  const allResults: Station[][] = [];

  for (let i = 0; i < grid.length; i += BATCH_SIZE) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const batch = grid.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((p) =>
        fetchStations({ lat: p.lat, lng: p.lng, rad: p.rad, type, sort, signal }).catch(
          (error: unknown) => {
            if (error instanceof DOMException && error.name === 'AbortError') {
              throw error;
            }
            return [] as Station[];
          },
        ),
      ),
    );
    allResults.push(...batchResults);
  }

  return allResults;
}

/** Fetch stations for multiple grid points, batched + deduplicated. */
async function fetchStationsGrid(
  grid: GridPoint[],
  type: FuelType,
  sort: 'price' | 'dist',
  signal?: AbortSignal,
): Promise<Station[]> {
  const results = await fetchBatched(grid, type, sort, signal);

  // Deduplicate by station ID
  const seen = new Set<string>();
  const deduped: Station[] = [];
  for (const batch of results) {
    for (const s of batch) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        deduped.push(s);
      }
    }
  }
  return deduped;
}

// ─── Hooks ───────────────────────────────────────────────────

export function useStationSearch(params: {
  lat: number | null;
  lng: number | null;
  radiusKm: number;
  fuelType: FuelType;
  sort?: 'price' | 'dist';
  enabled?: boolean;
}) {
  const { lat, lng, radiusKm, fuelType, sort = 'dist', enabled = true } = params;

  // For Germany-wide searches, use a stable key so panning doesn't re-trigger
  const isGermanyWide = radiusKm >= GERMANY_WIDE_THRESHOLD_KM;

  // Round coordinates to reduce unnecessary refetches when panning slightly
  const roundedLat = lat != null ? Math.round(lat * 100) / 100 : null;
  const roundedLng = lng != null ? Math.round(lng * 100) / 100 : null;
  const roundedRadius = Math.round(radiusKm);

  const queryKey = isGermanyWide
    ? ['stations', 'germany-wide', fuelType, sort]
    : ['stations', roundedLat, roundedLng, roundedRadius, fuelType, sort];

  // Longer cache for Germany-wide (data doesn't change that fast)
  const staleMs = isGermanyWide ? 5 * 60 * 1000 : STALE_TIME_LIST_MS;

  return useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      const grid = computeSearchGrid(lat!, lng!, radiusKm);
      if (grid.length === 1) {
        return fetchStations({
          lat: lat!,
          lng: lng!,
          rad: Math.min(radiusKm, MAX_API_RADIUS_KM),
          type: fuelType,
          sort,
          signal,
        });
      }
      return fetchStationsGrid(grid, fuelType, sort, signal);
    },
    enabled: enabled && lat != null && lng != null,
    staleTime: staleMs,
    refetchOnWindowFocus: !isGermanyWide,
    retry: 2,
  });
}

export function useStationDetail(stationId: string | null) {
  return useQuery({
    queryKey: ['station-detail', stationId],
    queryFn: ({ signal }) => fetchStationDetail(stationId!, signal),
    enabled: stationId != null,
    staleTime: STALE_TIME_PRICES_MS,
  });
}

export function usePriceUpdates(stationIds: string[], enabled = true) {
  return useQuery({
    queryKey: ['prices', ...stationIds],
    queryFn: ({ signal }) => fetchPrices(stationIds, signal),
    enabled: enabled && stationIds.length > 0,
    staleTime: STALE_TIME_PRICES_MS,
    refetchInterval: REFETCH_INTERVAL_PRICES_MS,
    refetchIntervalInBackground: false,
  });
}
