// ============================================================
// BFF - /api/stations
// Proxies station search to Java Price Service (via Gateway).
// Falls back to direct Tankerkoenig call if backend unavailable.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, BackendApiError } from '@/lib/api/backend-client';
import {
  ApiClient,
  StationService,
  API_BASE_URL,
} from '@tankpilot/core';
import type { FuelType } from '@tankpilot/core';

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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const lat = parseFiniteNumber(searchParams.get('lat'));
  const lng = parseFiniteNumber(searchParams.get('lng'));
  const rad = parseFiniteNumber(searchParams.get('rad')) ?? 5;
  const typeParam = searchParams.get('type') ?? 'e10';
  const sortParam = searchParams.get('sort') ?? 'dist';
  const type = typeParam as FuelType;
  const sort = sortParam as 'price' | 'dist';

  if (lat == null || lng == null) {
    return NextResponse.json(
      { error: 'Missing or invalid lat/lng parameters' },
      { status: 400 },
    );
  }

  if (!['diesel', 'e5', 'e10'].includes(type)) {
    return NextResponse.json(
      { error: 'Invalid fuel type. Use diesel, e5, or e10.' },
      { status: 400 },
    );
  }

  // Try Java backend first
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      rad: String(Math.min(Math.max(rad, 1), 25)),
      type,
      sort,
    });

    const result = await backendFetch<{ success: boolean; data: { stations: unknown[] } }>(
      `/api/v1/prices/stations?${params.toString()}`,
    );

    if (result.success && result.data) {
      return NextResponse.json({ stations: result.data.stations }, {
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      });
    }
  } catch (error) {
    console.warn(
      '[BFF] Java backend unavailable for stations, falling back to direct API:',
      error instanceof BackendApiError ? `${error.status} ${error.message}` : error,
    );
  }

  // Fallback: call Tankerkoenig directly
  if (!process.env.TANKERKOENIG_API_KEY) {
    return NextResponse.json(
      { error: 'Station service unavailable' },
      { status: 503 },
    );
  }

  try {
    const stations = await service.searchStations({
      lat,
      lng,
      radiusKm: Math.min(Math.max(rad, 1), 25),
      fuelType: type,
      sort,
    });

    return NextResponse.json({ stations }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch (error) {
    console.error('[BFF] Station search failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stations' },
      { status: 502 },
    );
  }
}
