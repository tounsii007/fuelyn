// ============================================================
// BFF - /api/history
// Proxies price history to Java Price Service (via Gateway).
// Falls back to local Prisma DB if Java backend is unavailable.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, BackendApiError } from '@/lib/api/backend-client';

function parseFiniteNumber(value: string | null): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

interface BackendHistoryResponse {
  success: boolean;
  data: {
    history: { price: number; timestamp: string }[];
    stats: {
      min: number;
      max: number;
      avg: number;
      trend: string;
      trendDelta: number;
      dataPoints: number;
    } | null;
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const stationId = searchParams.get('stationId');
  const fuelType = searchParams.get('fuelType');
  const daysParam = parseFiniteNumber(searchParams.get('days')) ?? 30;

  if (!stationId) {
    return NextResponse.json(
      { error: 'Missing stationId parameter' },
      { status: 400 },
    );
  }

  if (!fuelType || !['diesel', 'e5', 'e10'].includes(fuelType)) {
    return NextResponse.json(
      { error: 'Missing or invalid fuelType parameter. Use diesel, e5, or e10.' },
      { status: 400 },
    );
  }

  const days = Math.min(Math.max(Math.round(daysParam), 1), 90);

  // Try Java backend
  try {
    const params = new URLSearchParams({
      stationId,
      fuelType,
      days: String(days),
    });

    const result = await backendFetch<BackendHistoryResponse>(
      `/api/v1/prices/history?${params.toString()}`,
    );

    if (result.success && result.data) {
      return NextResponse.json(
        {
          history: result.data.history,
          stats: result.data.stats,
          stationId,
          fuelType,
          days,
        },
        {
          headers: {
            'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
          },
        },
      );
    }
  } catch (error) {
    console.warn(
      '[History] Java backend unavailable, falling back to local DB:',
      error instanceof BackendApiError ? `${error.status} ${error.message}` : error,
    );
  }

  // Fallback: try local Prisma if available
  try {
    const { prisma } = await import('@/lib/db/client');
    const since = new Date();
    since.setDate(since.getDate() - days);

    interface PriceRow {
      readonly price: number;
      readonly timestamp: Date;
    }

    const snapshots: PriceRow[] = await prisma.priceSnapshot.findMany({
      where: {
        stationId,
        fuelType,
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'asc' },
      select: { price: true, timestamp: true },
    });

    if (snapshots.length === 0) {
      return NextResponse.json({
        history: [],
        stats: null,
        stationId,
        fuelType,
        days,
      }, {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      });
    }

    const prices = snapshots.map((s: PriceRow) => s.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    const thirdLength = Math.max(1, Math.floor(prices.length / 3));
    const firstThird = prices.slice(0, thirdLength);
    const lastThird = prices.slice(-thirdLength);
    const firstAvg = firstThird.reduce((s, p) => s + p, 0) / firstThird.length;
    const lastAvg = lastThird.reduce((s, p) => s + p, 0) / lastThird.length;
    const trendDiff = lastAvg - firstAvg;

    let trend: 'rising' | 'falling' | 'stable';
    if (trendDiff > 0.005) trend = 'rising';
    else if (trendDiff < -0.005) trend = 'falling';
    else trend = 'stable';

    return NextResponse.json({
      history: snapshots.map((s: PriceRow) => ({
        price: s.price,
        timestamp: s.timestamp.toISOString(),
      })),
      stats: {
        min: Math.round(min * 1000) / 1000,
        max: Math.round(max * 1000) / 1000,
        avg: Math.round(avg * 1000) / 1000,
        trend,
        trendDelta: Math.round(trendDiff * 1000) / 1000,
        dataPoints: snapshots.length,
      },
      stationId,
      fuelType,
      days,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch (fallbackError) {
    console.error('[History] Both Java backend and local DB unavailable:', fallbackError);
    return NextResponse.json(
      { error: 'Price history service unavailable' },
      { status: 503 },
    );
  }
}
