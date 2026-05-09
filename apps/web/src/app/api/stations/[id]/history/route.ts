// ============================================================
// BFF — /api/stations/:id/history
//
// Proxies per-station price history from the Java price-service.
// The price-service stores every observed change in `price_snapshots`
// (Postgres), so a 24h window typically returns 50–300 points and
// a 7-day window 200–2000 — well below the few-MB threshold where
// we'd need pagination.
//
// Used by the StationCard sparkline + trend arrow + forecast chip.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, BackendApiError } from '@/lib/api/backend-client';

interface BackendHistoryEnvelope {
  readonly success: boolean;
  readonly data?: {
    readonly stationId: string;
    readonly fuelType: string;
    readonly history: Array<{ price: number; timestamp: string }>;
    readonly stats?: {
      readonly min: number;
      readonly max: number;
      readonly avg: number;
      readonly trend: number;
      readonly cheapestDay?: string;
      readonly expensiveDay?: string;
    };
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const stationId = id.trim();

  if (stationId.length < 10) {
    return NextResponse.json({ error: 'Invalid station ID' }, { status: 400 });
  }

  const { searchParams } = request.nextUrl;
  const fuelTypeRaw = (searchParams.get('fuelType') || 'e10').toLowerCase();
  const fuelType = ['diesel', 'e5', 'e10'].includes(fuelTypeRaw) ? fuelTypeRaw : 'e10';
  // Map the friendlier `range=24h|7d|30d` query into the backend's `days`.
  const range = (searchParams.get('range') || '24h').toLowerCase();
  const days = range === '24h' ? 1 : range === '7d' ? 7 : range === '30d' ? 30 : 1;

  try {
    const params = new URLSearchParams({
      stationId,
      fuelType,
      days: String(days),
    });
    const result = await backendFetch<BackendHistoryEnvelope>(
      `/api/v1/prices/history?${params.toString()}`,
    );

    if (result.success && result.data) {
      // Trim the response to just what the sparkline needs — keeps the
      // wire payload small and prevents accidental over-fetching.
      const history = (result.data.history ?? []).map((p) => ({
        price: p.price,
        timestamp: p.timestamp,
      }));
      const stats = result.data.stats
        ? {
            min: result.data.stats.min,
            max: result.data.stats.max,
            avg: result.data.stats.avg,
            trend: result.data.stats.trend,
            cheapestDay: result.data.stats.cheapestDay,
            expensiveDay: result.data.stats.expensiveDay,
          }
        : null;
      return NextResponse.json(
        { stationId, fuelType, history, stats },
        {
          // Sparkline data is fine to cache for 60 s — it changes when
          // a new price observation lands, which we already invalidate
          // server-side via cache-busters elsewhere.
          headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
        },
      );
    }
    // Backend responded but flagged failure — return empty history so
    // the sparkline degrades to a flat baseline rather than an error.
    return NextResponse.json(
      { stationId, fuelType, history: [], stats: null },
      { headers: { 'Cache-Control': 'public, s-maxage=10' } },
    );
  } catch (error) {
    console.warn(
      '[BFF] Price history fetch failed:',
      error instanceof BackendApiError ? `${error.status} ${error.message}` : error,
    );
    return NextResponse.json(
      { stationId, fuelType, history: [], stats: null },
      { headers: { 'Cache-Control': 'public, s-maxage=10' } },
    );
  }
}
