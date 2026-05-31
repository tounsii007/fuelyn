// ============================================================
// BFF — GET /api/border-crossing
// Live foreign-station prices around a border-crossing waypoint.
//
// Wires the Iter Z multi-country adapters into the Iter M
// border-crossing card so users see ACTUAL prices for the
// nearest foreign station instead of the static EU-bulletin
// estimate.
//
// Query: ?country=AT&lat=…&lng=…&fuel=…
// Result: { stations: UnifiedFuelStation[], cheapestPrice, source }
//
// Falls back to the static estimate gracefully if the foreign
// adapter is down — UI never sees a hard error.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  SpritpreisrechnerAdapter,
  PrixCarburantsAdapter,
  type FuelType,
} from '@fuelyn/core';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';

const limiter = createRateLimiter({ windowMs: 60_000, max: 20 });

function parseFloatOrNull(s: string | null): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function clampLat(n: number): number {
  return Math.max(-90, Math.min(90, n));
}
function clampLng(n: number): number {
  return Math.max(-180, Math.min(180, n));
}

export async function GET(request: NextRequest) {
  const ip = getClientKey(request);
  const rl = await limiter.check(`border:${ip}`);
  if (rl.limited) return NextResponse.json({ error: 'rate limit' }, { status: 429 });

  const sp = request.nextUrl.searchParams;
  const country = (sp.get('country') ?? '').toUpperCase();
  const latRaw = parseFloatOrNull(sp.get('lat'));
  const lngRaw = parseFloatOrNull(sp.get('lng'));
  const fuel = (sp.get('fuel') ?? 'e10') as FuelType;
  const radiusKm = Math.min(Math.max(parseFloatOrNull(sp.get('rad')) ?? 15, 1), 50);

  if (latRaw == null || lngRaw == null) {
    return NextResponse.json(
      { error: 'Missing lat/lng' },
      { status: 400 },
    );
  }
  // Clamp to valid earth coordinates so we never forward
  // out-of-range values to upstream foreign feeds.
  const lat = clampLat(latRaw);
  const lng = clampLng(lngRaw);
  if (!['diesel', 'e5', 'e10'].includes(fuel)) {
    return NextResponse.json({ error: 'Invalid fuel' }, { status: 400 });
  }

  let adapter;
  switch (country) {
    case 'AT':
      adapter = new SpritpreisrechnerAdapter({ fuelType: fuel });
      break;
    case 'FR':
      adapter = new PrixCarburantsAdapter();
      break;
    default:
      // No live adapter for this country yet (LU/CH/CZ/PL/NL/BE/DK/IT
      // either lack a free public API or need a deployment-hosted
      // CSV mirror like Iter Z's IT path). UI falls back to the
      // static estimate from Iter M.
      return NextResponse.json(
        {
          stations: [],
          cheapestPrice: null,
          source: null,
          fallback: 'static-estimate',
        },
        { headers: { 'Cache-Control': 'public, s-maxage=600' } },
      );
  }

  const result = await adapter.search({ lat, lng, radiusKm });
  if (result.error || result.stations.length === 0) {
    return NextResponse.json(
      {
        stations: [],
        cheapestPrice: null,
        source: result.source,
        fallback: 'static-estimate',
        error: result.error,
      },
      { headers: { 'Cache-Control': 'public, s-maxage=120' } },
    );
  }

  // Pick the cheapest station that has a price for the requested fuel.
  let cheapestPrice: number | null = null;
  let cheapestId: string | null = null;
  for (const s of result.stations) {
    const p = s.prices[fuel];
    if (typeof p === 'number' && p > 0 && (cheapestPrice == null || p < cheapestPrice)) {
      cheapestPrice = p;
      cheapestId = s.id;
    }
  }

  return NextResponse.json(
    {
      stations: result.stations.slice(0, 20),
      cheapestPrice,
      cheapestStationId: cheapestId,
      source: result.source,
    },
    {
      // Foreign feeds update less aggressively than DE — 5 min TTL is fine.
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    },
  );
}
