// ============================================================
// BFF — GET /api/prices/canonical?stationId=…&fuel=…
//
// Returns the crowd-sourced canonical price for a (station, fuel)
// pair if the aggregation engine accepted one in the recent window.
// Otherwise returns null so the caller falls back to the upstream
// Tankerkönig feed price.
//
// Used by the station detail page + the /widgets/top-deal data
// endpoint to surface community-corrected prices when available.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { aggregateReports } from '@fuelyn/core';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const stationId = searchParams.get('stationId');
  const fuel = searchParams.get('fuel');

  if (!stationId || !fuel || !['diesel', 'e5', 'e10'].includes(fuel)) {
    return NextResponse.json(
      { error: 'Missing or invalid stationId / fuel' },
      { status: 400 },
    );
  }

  try {
    const recent = await prisma.priceReport.findMany({
      where: {
        stationId,
        fuelType: fuel,
        createdAt: { gte: new Date(Date.now() - 6 * 3600 * 1000) },
      },
      select: {
        price: true,
        confidence: true,
        observedAt: true,
        photoVerified: true,
      },
    });

    const agg = aggregateReports(
      recent.map((r) => ({
        price: r.price,
        confidence: r.confidence,
        observedAt: r.observedAt.toISOString(),
        photoVerified: r.photoVerified,
      })),
    );

    return NextResponse.json(
      {
        canonicalPrice: agg.decision === 'accept-canonical' ? agg.canonicalPrice : null,
        decision: agg.decision,
        windowCount: agg.windowCount,
        totalWeight: agg.totalWeight,
        stddevEurPerL: agg.stddevEurPerL,
      },
      {
        // Short TTL — the canonical price can change with each new report.
        headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
      },
    );
  } catch (err) {
    console.error('[prices/canonical] read failed:', err);
    return NextResponse.json({ error: 'read failed' }, { status: 500 });
  }
}
