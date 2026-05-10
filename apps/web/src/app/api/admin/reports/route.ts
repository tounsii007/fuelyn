// ============================================================
// BFF — GET /api/admin/reports?status=flagged|accepted|all
//
// Moderation queue. Returns the latest 200 PriceReport rows that
// match the requested status. Auth: bearer token must equal
// FUELYN_ADMIN_TOKEN — single static admin secret kept out of
// localStorage / cookies.
//
// Returned columns include the ip-hash (NOT raw IP) for cluster
// detection and the photo-verified flag for trust weighting.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';

function adminAuthorized(request: NextRequest): boolean {
  const expected = process.env.FUELYN_ADMIN_TOKEN;
  if (!expected) return false;
  const auth = request.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return false;
  // Constant-time compare to neutralise timing attacks.
  const provided = auth.slice(7);
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(request: NextRequest) {
  if (!adminAuthorized(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get('status') ?? 'flagged';

  const where: Record<string, unknown> = {};
  if (status === 'flagged') {
    where.classification = { in: ['major-correction', 'suspicious'] };
    where.acceptedAt = null;
  } else if (status === 'accepted') {
    where.acceptedAt = { not: null };
  }

  const reports = await prisma.priceReport.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      stationId: true,
      fuelType: true,
      price: true,
      observedAt: true,
      createdAt: true,
      classification: true,
      confidence: true,
      photoVerified: true,
      ipHash: true,
      acceptedAt: true,
      userId: true,
    },
  });

  return NextResponse.json({ reports, count: reports.length });
}

/**
 * POST /api/admin/reports — bulk accept / reject. Body:
 *   { ids: number[], action: 'accept' | 'reject' }
 */
export async function POST(request: NextRequest) {
  if (!adminAuthorized(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let body: { ids?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  if (
    !Array.isArray(body.ids) ||
    body.ids.some((id) => typeof id !== 'number') ||
    (body.action !== 'accept' && body.action !== 'reject')
  ) {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const ids = body.ids as number[];
  if (body.action === 'accept') {
    await prisma.priceReport.updateMany({
      where: { id: { in: ids } },
      data: { acceptedAt: new Date() },
    });
  } else {
    await prisma.priceReport.deleteMany({ where: { id: { in: ids } } });
  }
  return NextResponse.json({ success: true, affected: ids.length });
}
