// ============================================================
// BFF - /api/prices
// Proxies batch price fetch to Java Price Service (via Gateway).
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

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const idsParam = searchParams.get('ids');

  if (!idsParam) {
    return NextResponse.json(
      { error: 'Missing ids parameter' },
      { status: 400 },
    );
  }

  const ids = idsParam
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (ids.length === 0 || ids.length > 10) {
    return NextResponse.json(
      { error: 'Provide 1-10 station IDs' },
      { status: 400 },
    );
  }

  // Try Java backend first
  try {
    const result = await backendFetch<{ success: boolean; data: { prices: unknown } }>(
      `/api/v1/prices/batch?ids=${ids.join(',')}`,
    );

    if (result.success && result.data) {
      return NextResponse.json({ prices: result.data.prices }, {
        headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
      });
    }
  } catch (error) {
    console.warn(
      '[BFF] Java backend unavailable for prices, falling back:',
      error instanceof BackendApiError ? `${error.status} ${error.message}` : error,
    );
  }

  // Fallback: call Tankerkoenig directly
  if (!process.env.TANKERKOENIG_API_KEY) {
    return NextResponse.json(
      { error: 'Price service unavailable' },
      { status: 503 },
    );
  }

  try {
    const prices = await service.fetchPrices(ids);
    return NextResponse.json({ prices }, {
      headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
    });
  } catch (error) {
    console.error('[BFF] Price fetch failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch prices' },
      { status: 502 },
    );
  }
}
