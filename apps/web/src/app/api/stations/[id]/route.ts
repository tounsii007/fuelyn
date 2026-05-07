// ============================================================
// BFF - /api/stations/[id]
// Proxies station detail to Java Price Service (via Gateway).
// Falls back to direct Tankerkoenig call if backend unavailable.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, BackendApiError } from '@/lib/api/backend-client';
import {
  ApiClient,
  StationService,
  API_BASE_URL,
} from '@fuelyn/core';

const client = new ApiClient({ baseUrl: API_BASE_URL });
const service = new StationService({
  client,
  apiKey: process.env.TANKERKOENIG_API_KEY,
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stationId = id.trim();

  if (stationId.length < 10) {
    return NextResponse.json(
      { error: 'Invalid station ID' },
      { status: 400 },
    );
  }

  // Try Java backend first
  try {
    const result = await backendFetch<{ success: boolean; data: { station: unknown } }>(
      `/api/v1/prices/stations/${encodeURIComponent(stationId)}`,
    );

    if (result.success && result.data) {
      return NextResponse.json({ station: result.data.station }, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      });
    }
  } catch (error) {
    console.warn(
      '[BFF] Java backend unavailable for station detail, falling back:',
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
    const station = await service.fetchStationDetail(stationId);
    return NextResponse.json({ station }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (error) {
    console.error(`[BFF] Station detail failed for ${stationId}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch station details' },
      { status: 502 },
    );
  }
}
