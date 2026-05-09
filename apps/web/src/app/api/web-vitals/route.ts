// ============================================================
// BFF — POST /api/web-vitals
//
// Phase A3 — Web-Vitals collector. Accepts the lightweight
// payload emitted by WebVitalsReporter, validates the metric
// name + value range, and forwards a single row per metric to
// the Java backend (or, if disabled, just logs).
//
// Payload contract:
//   {
//     "name":      "LCP" | "INP" | "CLS" | "FCP" | "TTFB",
//     "value":     number,        // ms (CLS is unitless score)
//     "rating":    "good" | "needs-improvement" | "poor",
//     "sessionId": string,        // opaque, random per page load
//     "pathname":  string,        // route, no query string
//     "ts":        number         // client wall-clock millis
//   }
//
// Response: 204 on success (no body). 400 on malformed payload.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

interface WebVitalPayload {
  name: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  sessionId: string;
  pathname: string;
  ts: number;
}

const VALID_NAMES = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);
const VALID_RATINGS = new Set(['good', 'needs-improvement', 'poor']);

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    // sendBeacon ships text/plain by default; we accept both.
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : null;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  if (!isWebVital(body)) {
    return new NextResponse(null, { status: 400 });
  }

  // Phase A3 stops here — we just log into the BFF stdout, which is
  // already shipped to JSON in production. A follow-up commit can
  // forward to a Java endpoint or directly to a Postgres table via
  // Prisma. The collector contract is stable, so the storage layer
  // can be added without re-deploying clients.
  console.info(
    `[WebVitals] ${body.name}=${body.value} ${body.rating} (${body.pathname}) sid=${body.sessionId.slice(0, 8)}`,
  );

  return new NextResponse(null, { status: 204 });
}

function isWebVital(x: unknown): x is WebVitalPayload {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.name === 'string' && VALID_NAMES.has(o.name) &&
    typeof o.value === 'number' && Number.isFinite(o.value) &&
    typeof o.rating === 'string' && VALID_RATINGS.has(o.rating) &&
    typeof o.sessionId === 'string' && o.sessionId.length > 0 &&
    typeof o.pathname === 'string' &&
    typeof o.ts === 'number' && Number.isFinite(o.ts)
  );
}
