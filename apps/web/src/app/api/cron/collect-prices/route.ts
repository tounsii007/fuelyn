// ============================================================
// BFF - /api/cron/collect-prices
// Triggers price collection for major German cities.
// Protected by CRON_SECRET (constant-time compare).
// Body validated by Zod for predictable schema.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { safeEqual } from '@/lib/http/timing-safe';
import { parseJson } from '@/lib/http/validate';
import { PriceCollectionBodySchema } from '@/lib/api/schemas';
import {
  runFullCollection,
  collectPricesForArea,
  COLLECTION_CITIES,
} from '@/lib/services/price-collector';
import type { CollectionCity } from '@/lib/services/price-collector';

const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 25;

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn('[Cron] CRON_SECRET is not set — rejecting all requests');
    return false;
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length);
    if (safeEqual(token, cronSecret)) return true;
  }

  const secretHeader = request.headers.get('x-cron-secret');
  if (secretHeader && safeEqual(secretHeader, cronSecret)) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.TANKERKOENIG_API_KEY) {
    return NextResponse.json(
      { error: 'Server is missing Tankerkoenig API configuration' },
      { status: 503 },
    );
  }

  // Body is optional; validate when present.
  const contentType = request.headers.get('content-type') ?? '';
  let body: typeof PriceCollectionBodySchema._output = undefined;
  if (contentType.includes('application/json')) {
    const parsed = await parseJson(request, PriceCollectionBodySchema);
    if (!parsed.success) return parsed.response;
    body = parsed.data;
  }

  try {
    // Mode 1: single area (lat + lng provided)
    if (body && typeof body.lat === 'number' && typeof body.lng === 'number') {
      const radiusKm = clampRadius(body.radiusKm);
      const result = await collectPricesForArea(body.lat, body.lng, radiusKm);
      return NextResponse.json({
        mode: 'single-area',
        lat: body.lat,
        lng: body.lng,
        radiusKm,
        ...result,
      });
    }

    // Mode 2: multi-city collection (default or custom cities list)
    const cities: CollectionCity[] =
      body?.cities && body.cities.length > 0 ? body.cities : COLLECTION_CITIES;
    const radiusKm = clampRadius(body?.radiusKm);
    const result = await runFullCollection(cities, radiusKm);

    return NextResponse.json({
      mode: 'multi-city',
      citiesCount: cities.length,
      ...result,
    });
  } catch (error) {
    console.error('[Cron] Price collection failed:', error);
    return NextResponse.json({ error: 'Price collection failed' }, { status: 500 });
  }
}

function clampRadius(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_RADIUS_KM;
  return Math.min(Math.max(value, 1), MAX_RADIUS_KM);
}
