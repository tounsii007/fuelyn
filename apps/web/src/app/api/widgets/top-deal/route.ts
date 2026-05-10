// ============================================================
// BFF - /api/widgets/top-deal
// Serves Adaptive-Card data for the Windows 11 PWA widget tile.
// Returns JSON shaped to match /widgets/top-deal/template.json
// placeholders so the OS can render the live "Top Deal" card.
//
// Designed for fetch-with-Cache-Control (the OS polls the URL on
// the cadence declared in manifest.json -> widgets[].update).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, BackendApiError } from '@/lib/api/backend-client';
import {
  ApiClient,
  StationService,
  API_BASE_URL,
  haversineDistance,
} from '@fuelyn/core';
import type { FuelType, Station } from '@fuelyn/core';
import {
  FUEL_LABELS,
  buildAddress,
  buildEmpty,
  formatDistance,
  formatPriceDe,
  formatRelative,
  pickCheapest,
  priceFor,
  type WidgetData,
} from './format';

const client = new ApiClient({ baseUrl: API_BASE_URL });
const service = new StationService({
  client,
  apiKey: process.env.TANKERKOENIG_API_KEY,
});

interface BackendStationsResponse {
  success: boolean;
  data?: { stations: Station[] };
}

// Prefer Berlin city centre when no coords are passed (best-effort fallback
// — the actual user location should always be supplied by the OS launcher
// or the in-app widget config so the displayed deal stays accurate).
const DEFAULT_LAT = 52.52;
const DEFAULT_LNG = 13.405;
const DEFAULT_RADIUS_KM = 5;

function parseCoord(value: string | null, fallback: number): number {
  if (value == null || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseFuel(value: string | null): FuelType {
  const raw = (value ?? 'e10').toLowerCase();
  if (raw === 'diesel' || raw === 'e5' || raw === 'e10') return raw;
  return 'e10';
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = parseCoord(searchParams.get('lat'), DEFAULT_LAT);
  const lng = parseCoord(searchParams.get('lng'), DEFAULT_LNG);
  const radius = Math.min(
    Math.max(parseCoord(searchParams.get('rad'), DEFAULT_RADIUS_KM), 1),
    25,
  );
  const fuel = parseFuel(searchParams.get('fuel'));
  const locale = (searchParams.get('locale') ?? 'de').toLowerCase();

  let stations: Station[] = [];

  // 1) Try Java backend (preferred — caches & rate-limits centrally).
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      rad: String(radius),
      type: fuel,
      sort: 'price',
    });
    const result = await backendFetch<BackendStationsResponse>(
      `/api/v1/prices/stations?${params.toString()}`,
    );
    if (result.success && result.data?.stations) {
      stations = result.data.stations;
    }
  } catch (error) {
    // Soft-fail — log once and try direct upstream.
    console.warn(
      '[widget/top-deal] backend unavailable, falling back:',
      error instanceof BackendApiError
        ? `${error.status} ${error.message}`
        : error,
    );
  }

  // 2) Fallback: direct Tankerkoenig (only if API key configured).
  if (stations.length === 0 && process.env.TANKERKOENIG_API_KEY) {
    try {
      stations = await service.searchStations({
        lat,
        lng,
        radiusKm: radius,
        fuelType: fuel,
        sort: 'price',
      });
    } catch (error) {
      console.error('[widget/top-deal] direct search failed:', error);
    }
  }

  const cheapest = pickCheapest(stations, fuel);

  if (!cheapest) {
    return NextResponse.json(buildEmpty(locale), {
      headers: {
        // Short TTL on empty responses so the OS retries soon.
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  }

  const price = priceFor(cheapest, fuel)!;
  const distanceKm =
    typeof cheapest.dist === 'number' && Number.isFinite(cheapest.dist)
      ? cheapest.dist
      : haversineDistance(
          { lat, lng },
          { lat: cheapest.lat, lng: cheapest.lng },
        );

  // Station snapshots from the price service don't carry a per-station
  // timestamp, so we fall back to "now" — that mirrors the live-feed
  // freshness, since the upstream price service revalidates aggressively.
  const lastUpdated = new Date();

  const data: WidgetData = {
    $schema: 'https://adaptivecards.io/schemas/adaptive-card.json',
    stationBrand: cheapest.brand || cheapest.name || 'Tankstelle',
    address: buildAddress(cheapest) || cheapest.name || '',
    pricePerLiter: formatPriceDe(price),
    distanceKm: formatDistance(distanceKm),
    fuelType: FUEL_LABELS[fuel],
    updatedRelative: formatRelative(lastUpdated, locale),
    deepLink: `/station/${encodeURIComponent(cheapest.id)}?source=widget-top-deal`,
  };

  return NextResponse.json(data, {
    headers: {
      // Match the manifest's `update: 900` (15 min) cadence on the cache TTL.
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
    },
  });
}
