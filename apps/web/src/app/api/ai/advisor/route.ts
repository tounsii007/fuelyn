// ============================================================
// BFF - /api/ai/advisor
// Proxies AI recommendations to the Java AI service (via Gateway)
// and falls back to the local heuristic engine from @fuelyn/core
// when the backend is unreachable.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { backendFetch, BackendApiError } from '@/lib/api/backend-client';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';
import { parseJson } from '@/lib/http/validate';
import { AdvisorRequestSchema, type AdvisorRequest } from '@/lib/api/schemas';
import { analyzePrices, type PriceDataInput } from '@fuelyn/core';

// ─── Types ──────────────────────────────────────────────────

interface AIAdvisorResponse {
  action: string;
  headline: string;
  explanation: string;
  bestTimePrediction: string;
  savingsEstimate: number;
  confidence: string;
  bestStation?: { name: string; reason: string };
  priceOutlook: string;
  tip: string;
  fromCache?: boolean;
  fromAI?: boolean;
}

interface BackendResponse {
  success: boolean;
  data: AIAdvisorResponse;
  error?: string;
}

// ─── Rate Limiting ──────────────────────────────────────────

const rateLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

// ─── Local fallback ─────────────────────────────────────────

function localHeuristicFallback(body: AdvisorRequest): AIAdvisorResponse {
  const fillUpLiters = body.fillUpLiters ?? 50;
  const historyData: PriceDataInput[] =
    body.priceHistory && body.priceHistory.length >= 4
      ? body.priceHistory
      : body.prices.map((p, i) => ({
          price: p.price,
          timestamp: new Date(Date.now() - i * 3600_000).toISOString(),
        }));

  const rec = analyzePrices(historyData, body.fuelType, fillUpLiters);

  const cheapest = body.prices.reduce(
    (best, s) => (s.price < best.price ? s : best),
    body.prices[0]!,
  );

  return {
    action: rec.action,
    headline: rec.headline,
    explanation: rec.explanation,
    bestTimePrediction: rec.bestTimePrediction,
    savingsEstimate: rec.savingsEstimate,
    confidence: rec.confidence,
    bestStation: {
      name: cheapest.stationName,
      reason: `Günstigster Preis in ${cheapest.distance.toFixed(1)} km Entfernung`,
    },
    priceOutlook: `Preise ${
      rec.trend > 0 ? 'steigend' : rec.trend < 0 ? 'fallend' : 'stabil'
    } — ${rec.cheapestDay} ist typischerweise günstig.`,
    tip: `Tanke bevorzugt ${rec.cheapestDay}s zwischen 18 und 20 Uhr und vermeide ${rec.expensiveDay}s.`,
  };
}

// ─── Route Handler ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 1. Rate limiting
  const { limited, remaining, resetAt } = rateLimiter.check(getClientKey(request));
  const retryAfterSec = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
  if (limited) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Max 10 requests per minute.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': '10',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)),
        },
      },
    );
  }

  const responseHeaders = {
    'Cache-Control': 'private, no-store',
    'X-RateLimit-Limit': '10',
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.floor(resetAt / 1000)),
  };

  // 2. Parse + validate body via Zod
  const parsed = await parseJson(request, AdvisorRequestSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  // 3. Try Java backend first, fall back to local heuristic
  try {
    const backendResult = await backendFetch<BackendResponse>('/api/v1/ai/advisor', {
      method: 'POST',
      body: {
        fuelType: body.fuelType,
        prices: body.prices.slice(0, 15),
        priceHistory: body.priceHistory ?? null,
        lat: body.lat,
        lng: body.lng,
        fillUpLiters: body.fillUpLiters ?? 50,
      },
    });

    if (backendResult.success && backendResult.data) {
      return NextResponse.json(
        {
          recommendation: backendResult.data,
          source: backendResult.data.fromAI ? 'ai' : 'heuristic',
        },
        { headers: responseHeaders },
      );
    }
  } catch (error) {
    console.warn(
      '[AI Advisor] Backend unavailable, using local fallback:',
      error instanceof BackendApiError ? `${error.status} ${error.message}` : error,
    );
  }

  // 4. Local fallback
  const result = localHeuristicFallback(body);
  return NextResponse.json(
    { recommendation: result, source: 'heuristic' as const },
    { headers: responseHeaders },
  );
}
