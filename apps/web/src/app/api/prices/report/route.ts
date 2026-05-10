// ============================================================
// BFF — POST /api/prices/report
// Accepts anonymous price-correction reports from end users.
// Pipeline:
//   1) IP-keyed rate limit (1 report per (IP, station, fuel) /
//      5 minutes)
//   2) Zod request validation
//   3) Pure-engine validatePriceReport (sanity bounds + class)
//   4) (placeholder) forward to backend or in-memory store
//
// We deliberately don't authenticate — the whole point of this
// surface is to be a low-friction "tap to report" affordance.
// The classification + confidence carried in the response give
// the future backend service everything it needs to vote on
// whether the report should impact the canonical price.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  validatePriceReport,
  MIN_PLAUSIBLE_PRICE,
  MAX_PLAUSIBLE_PRICE,
  aggregateReports,
} from '@fuelyn/core';
import type { FuelType } from '@fuelyn/core';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';
import { parseJson } from '@/lib/http/validate';
import { prisma } from '@/lib/db/client';
import { getOrCreateSession } from '@/lib/auth/session';
import { sha256Hex } from '@/lib/auth/jwt';

// One report per (IP, station, fuel) / 5 minutes — generous enough that
// users can correct typos, tight enough to neuter trivial spam loops.
const limiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 1 });

const RequestSchema = z.object({
  stationId: z.string().min(1).max(120),
  fuelType: z.enum(['diesel', 'e5', 'e10']),
  price: z
    .number()
    .min(MIN_PLAUSIBLE_PRICE)
    .max(MAX_PLAUSIBLE_PRICE),
  observedAt: z.string().datetime().optional(),
  knownPrice: z.number().positive().nullable().optional(),
  /**
   * True when the user attached a pump-display photo that the OCR
   * pipeline successfully extracted a matching price from. The BFF
   * uses this to bump the engine's confidence by +0.1 — capped at 1.
   */
  photoVerified: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const parsed = await parseJson(request, RequestSchema);
  if (!parsed.success) return parsed.response;

  const ip = getClientKey(request);
  const key = `report:${ip}:${parsed.data.stationId}:${parsed.data.fuelType}`;
  const rl = limiter.check(key);
  if (rl.limited) {
    return NextResponse.json(
      {
        error: 'Too many reports for this station / fuel — try again later.',
        retryAfterSeconds: Math.ceil((rl.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  const validation = validatePriceReport({
    stationId: parsed.data.stationId,
    fuelType: parsed.data.fuelType as FuelType,
    price: parsed.data.price,
    observedAt: parsed.data.observedAt,
    knownPrice: parsed.data.knownPrice ?? null,
  });

  if (!validation.ok) {
    return NextResponse.json(
      {
        error: 'Report rejected',
        rejection: validation.rejection,
        classification: validation.classification,
      },
      { status: 400 },
    );
  }

  // Photo-verified reports get a +0.1 confidence bump (capped at 1.0).
  // Visual proof is the strongest signal we have for crowd reports.
  const finalConfidence = parsed.data.photoVerified
    ? Math.min(1, validation.confidence + 0.1)
    : validation.confidence;

  // -----------------------------------------------------------------
  // Persistence + immediate aggregation
  // -----------------------------------------------------------------
  // Resolve the calling user (anonymous-first; null is fine).
  const session = await getOrCreateSession(request);
  const userId = session?.userId ?? null;

  // ip-hash so the moderation queue can detect spam clusters without
  // ever storing the raw IP.
  const ipHash = sha256Hex(`${ip}|${parsed.data.stationId}`);

  try {
    await prisma.priceReport.create({
      data: {
        userId,
        stationId: validation.record!.stationId,
        fuelType: validation.record!.fuelType,
        price: validation.record!.price,
        observedAt: new Date(validation.record!.observedAt),
        classification: validation.classification,
        confidence: finalConfidence,
        photoVerified: !!parsed.data.photoVerified,
        ipHash,
      },
    });
  } catch (err) {
    console.error('[prices/report] persist failed:', err);
    // Non-fatal — the validation result is still returned to the client.
  }

  // Immediately re-aggregate the recent window so the response can
  // tell the client whether the moderation pipeline accepted, flagged,
  // or rejected the new evidence.
  let aggregation = null as ReturnType<typeof aggregateReports> | null;
  try {
    const recent = await prisma.priceReport.findMany({
      where: {
        stationId: validation.record!.stationId,
        fuelType: validation.record!.fuelType,
        createdAt: { gte: new Date(Date.now() - 6 * 3600 * 1000) },
      },
      select: {
        price: true,
        confidence: true,
        observedAt: true,
        photoVerified: true,
      },
    });
    aggregation = aggregateReports(
      recent.map((r) => ({
        price: r.price,
        confidence: r.confidence,
        observedAt: r.observedAt.toISOString(),
        photoVerified: r.photoVerified,
      })),
      { upstreamPrice: parsed.data.knownPrice ?? null },
    );

    // If the aggregation accepted a canonical price, mark every row in
    // the window as accepted so the moderation dashboard can show
    // exactly which evidence drove the decision.
    if (aggregation.decision === 'accept-canonical' && aggregation.canonicalPrice != null) {
      await prisma.priceReport.updateMany({
        where: {
          stationId: validation.record!.stationId,
          fuelType: validation.record!.fuelType,
          createdAt: { gte: new Date(Date.now() - 6 * 3600 * 1000) },
          acceptedAt: null,
        },
        data: { acceptedAt: new Date() },
      });
    }
  } catch (err) {
    console.warn('[prices/report] aggregation read failed:', err);
  }

  return NextResponse.json(
    {
      success: true,
      classification: validation.classification,
      confidence: finalConfidence,
      deltaEurPerL: validation.deltaEurPerL,
      record: validation.record,
      photoVerified: parsed.data.photoVerified ?? false,
      aggregation,
    },
    {
      status: 202, // Accepted (queued for moderation / aggregation)
      headers: {
        'X-RateLimit-Remaining': String(rl.remaining),
        'X-RateLimit-Reset': String(rl.resetAt),
      },
    },
  );
}
