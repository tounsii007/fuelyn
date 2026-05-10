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
} from '@fuelyn/core';
import type { FuelType } from '@fuelyn/core';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';
import { parseJson } from '@/lib/http/validate';

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

  // -----------------------------------------------------------------
  // Persistence — currently a no-op, since the backend service that
  // owns the canonical price store isn't in scope for this iter.
  // Logged at INFO so an operator can grep recent reports if needed.
  // -----------------------------------------------------------------
  console.info(
    '[prices/report] accepted',
    JSON.stringify({
      ...validation.record,
      classification: validation.classification,
      confidence: validation.confidence,
      deltaEurPerL: validation.deltaEurPerL,
    }),
  );

  return NextResponse.json(
    {
      success: true,
      classification: validation.classification,
      confidence: validation.confidence,
      deltaEurPerL: validation.deltaEurPerL,
      record: validation.record,
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
