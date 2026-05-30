// ============================================================
// BFF - /api/stats/prices
// Proxies price statistics to Java Price Service (via Gateway).
// Falls back to local Prisma DB if backend unavailable.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, BackendApiError } from '@/lib/api/backend-client';

function parseFiniteNumber(value: string | null): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const lat = parseFiniteNumber(searchParams.get('lat'));
  const lng = parseFiniteNumber(searchParams.get('lng'));
  const radiusKm = parseFiniteNumber(searchParams.get('radiusKm')) ?? 10;
  const fuelType = searchParams.get('fuelType') ?? 'e10';
  const daysParam = parseFiniteNumber(searchParams.get('days')) ?? 7;

  if (lat == null || lng == null) {
    return NextResponse.json(
      { error: 'Missing or invalid lat/lng parameters' },
      { status: 400 },
    );
  }

  if (!['diesel', 'e5', 'e10'].includes(fuelType)) {
    return NextResponse.json(
      { error: 'Invalid fuelType. Use diesel, e5, or e10.' },
      { status: 400 },
    );
  }

  const days = Math.min(Math.max(Math.round(daysParam), 1), 90);

  // Try Java backend
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radiusKm: String(Math.min(radiusKm, 25)),
      fuelType,
      days: String(days),
    });

    const result = await backendFetch<{ success: boolean; data: unknown }>(
      `/api/v1/prices/stats?${params.toString()}`,
    );

    if (result.success && result.data) {
      return NextResponse.json(result.data, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      });
    }
  } catch (error) {
    console.warn(
      '[Stats] Java backend unavailable, falling back to local DB:',
      error instanceof BackendApiError ? `${error.status} ${error.message}` : error,
    );
  }

  // Fallback: try local Prisma
  try {
    const { prisma } = await import('@/lib/db/client');

    const since = new Date();
    since.setDate(since.getDate() - days);

    function getBoundingBox(lat: number, lng: number, radiusKm: number) {
      const latDelta = radiusKm / 111.32;
      const lngDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
      return { minLat: lat - latDelta, maxLat: lat + latDelta, minLng: lng - lngDelta, maxLng: lng + lngDelta };
    }

    const bbox = getBoundingBox(lat, lng, Math.min(radiusKm, 25));

    const stationsInArea = await prisma.stationMeta.findMany({
      where: { lat: { gte: bbox.minLat, lte: bbox.maxLat }, lng: { gte: bbox.minLng, lte: bbox.maxLng } },
      select: { id: true, name: true, brand: true },
    });

    if (stationsInArea.length === 0) {
      return NextResponse.json({
        stations: 0, averagePrice: null, minStation: null, maxStation: null,
        dayOfWeekPattern: [], trend: null, fuelType, days,
      }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
    }

    const stationIds = stationsInArea.map((s) => s.id);
    const snapshots = await prisma.priceSnapshot.findMany({
      where: { stationId: { in: stationIds }, fuelType, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
      select: { stationId: true, price: true, timestamp: true },
    });

    if (snapshots.length === 0) {
      return NextResponse.json({
        stations: stationsInArea.length, dataPoints: 0, averagePrice: null,
        minStation: null, maxStation: null, dayOfWeekPattern: [], trend: null, fuelType, days,
      }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
    }

    const allPrices = snapshots.map((s) => s.price);
    const overallAvg = allPrices.reduce((sum, p) => sum + p, 0) / allPrices.length;

    const stationAvgs = new Map<string, { sum: number; count: number }>();
    for (const snap of snapshots) {
      const entry = stationAvgs.get(snap.stationId) ?? { sum: 0, count: 0 };
      entry.sum += snap.price;
      entry.count += 1;
      stationAvgs.set(snap.stationId, entry);
    }

    const stationMap = new Map(stationsInArea.map((s) => [s.id, s]));
    let minStationId = '', maxStationId = '', minAvg = Infinity, maxAvg = -Infinity;
    for (const [id, entry] of stationAvgs) {
      const avg = entry.sum / entry.count;
      if (avg < minAvg) { minAvg = avg; minStationId = id; }
      if (avg > maxAvg) { maxAvg = avg; maxStationId = id; }
    }

    const dayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayBuckets = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
    for (const snap of snapshots) {
      const i = snap.timestamp.getDay();
      dayBuckets[i]!.sum += snap.price;
      dayBuckets[i]!.count += 1;
    }

    const thirdLen = Math.max(1, Math.floor(allPrices.length / 3));
    const firstAvg = allPrices.slice(0, thirdLen).reduce((s, p) => s + p, 0) / thirdLen;
    const lastAvg = allPrices.slice(-thirdLen).reduce((s, p) => s + p, 0) / thirdLen;
    const trendDiff = lastAvg - firstAvg;

    const minMeta = stationMap.get(minStationId);
    const maxMeta = stationMap.get(maxStationId);

    return NextResponse.json({
      stations: stationsInArea.length, dataPoints: snapshots.length,
      averagePrice: Math.round(overallAvg * 1000) / 1000,
      minStation: minMeta ? { id: minStationId, name: minMeta.name, brand: minMeta.brand, avgPrice: Math.round(minAvg * 1000) / 1000 } : null,
      maxStation: maxMeta ? { id: maxStationId, name: maxMeta.name, brand: maxMeta.brand, avgPrice: Math.round(maxAvg * 1000) / 1000 } : null,
      dayOfWeekPattern: dayBuckets.map((b, i) => ({
        day: dayLabels[i]!, dayIndex: i,
        avgPrice: b.count > 0 ? Math.round((b.sum / b.count) * 1000) / 1000 : null,
        dataPoints: b.count,
      })),
      trend: trendDiff > 0.005 ? 'rising' : trendDiff < -0.005 ? 'falling' : 'stable',
      trendDelta: Math.round(trendDiff * 1000) / 1000,
      fuelType, days,
    }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } });
  } catch (fallbackError) {
    console.error('[Stats] Both Java backend and local DB unavailable:', fallbackError);
    return NextResponse.json({ error: 'Price statistics service unavailable' }, { status: 503 });
  }
}
