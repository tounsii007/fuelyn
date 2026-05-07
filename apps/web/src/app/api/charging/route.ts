// ============================================================
// BFF - /api/charging
// Proxies EV charging search to Java Price Service (via Gateway).
// Falls back to direct OpenChargeMap call if backend unavailable.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, BackendApiError } from '@/lib/api/backend-client';

const OCM_BASE = 'https://api.openchargemap.io/v3/poi';

function parseFiniteNumber(value: string | null): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const lat = parseFiniteNumber(searchParams.get('lat'));
  const lng = parseFiniteNumber(searchParams.get('lng'));
  const rad = parseFiniteNumber(searchParams.get('rad')) ?? 10;

  if (lat == null || lng == null) {
    return NextResponse.json(
      { error: 'Missing or invalid lat/lng parameters' },
      { status: 400 },
    );
  }

  // Try Java backend first
  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      rad: String(Math.min(rad, 100)),
    });

    const result = await backendFetch<{ success: boolean; data: { stations: unknown[] } }>(
      `/api/v1/prices/charging?${params.toString()}`,
    );

    if (result.success && result.data) {
      return NextResponse.json({ stations: result.data.stations }, {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
      });
    }
  } catch (error) {
    console.warn(
      '[BFF] Java backend unavailable for charging, falling back:',
      error instanceof BackendApiError ? `${error.status} ${error.message}` : error,
    );
  }

  // Fallback: call OpenChargeMap directly
  try {
    const params = new URLSearchParams({
      output: 'json',
      latitude: String(lat),
      longitude: String(lng),
      distance: String(Math.min(rad, 100)),
      distanceunit: 'KM',
      maxresults: '100',
      compact: 'true',
      verbose: 'false',
      countrycode: 'DE',
    });

    const apiKey = process.env.OPENCHARGEMAP_API_KEY;
    if (apiKey) params.set('key', apiKey);

    const res = await fetch(`${OCM_BASE}?${params}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { 'User-Agent': 'TankPilot/1.0' },
    });

    if (!res.ok) throw new Error(`OCM responded with ${res.status}`);

    const raw = await res.json();

    const CONNECTION_MAP: Record<number, string> = {
      1: 'Typ 1 (J1772)', 2: 'CHAdeMO', 25: 'Typ 2 (Mennekes)',
      27: 'Tesla Supercharger', 32: 'CCS (Combo 1)', 33: 'CCS (Combo 2)',
      36: 'Typ 2 (Steckdose)', 0: 'Unbekannt',
    };

    const stations = (raw as Array<Record<string, unknown>>)
      .filter((r: Record<string, unknown>) => {
        const addr = r.AddressInfo as Record<string, unknown> | undefined;
        return addr?.Latitude && addr?.Longitude;
      })
      .map((r: Record<string, unknown>) => {
        const addr = r.AddressInfo as Record<string, unknown>;
        const connections = (r.Connections as Array<Record<string, unknown>> || []).map((c) => ({
          type: CONNECTION_MAP[c.ConnectionTypeID as number] ||
                (c.ConnectionType as Record<string, unknown>)?.Title || `Typ ${c.ConnectionTypeID}`,
          powerKW: c.PowerKW ?? null,
          quantity: c.Quantity ?? 1,
        }));
        const status = r.StatusType as Record<string, unknown> | undefined;
        return {
          id: String(r.ID),
          name: addr.Title || 'Ladestation',
          operator: (r.OperatorInfo as Record<string, unknown>)?.Title || 'Unbekannt',
          lat: addr.Latitude,
          lng: addr.Longitude,
          dist: addr.Distance ?? 0,
          address: addr.AddressLine1 || '',
          city: addr.Town || '',
          postCode: addr.Postcode || '',
          connections,
          isOperational: status?.IsOperational !== false,
          usageCost: r.UsageCost || null,
          accessType: (r.UsageType as Record<string, unknown>)?.Title || null,
        };
      });

    return NextResponse.json({ stations }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
    });
  } catch (error) {
    console.error('[BFF] Charging station search failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch charging stations' },
      { status: 502 },
    );
  }
}
