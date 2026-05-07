// ============================================================
// BFF — /api/stream/prices  (Server-Sent Events)
//
// Streams real-time price updates from the gateway to the browser.
// The upstream connection carries our service-side API key; the
// browser's EventSource only sees the public proxy URL.
//
// Critical: do NOT buffer the response. We pipe upstream bytes
// directly through a ReadableStream and set Content-Type so the
// Next.js runtime treats it as a long-lived chunked response.
// ============================================================

import type { NextRequest } from 'next/server';

const BACKEND_URL = process.env.JAVA_BACKEND_URL ?? 'http://localhost:8080';
const API_KEY = process.env.JAVA_BACKEND_API_KEY ?? 'dev-api-key-change-in-production';

// Tell Next this route is dynamic so it isn't statically optimized.
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const stations = searchParams.get('stations');
  const upstreamPath = stations
    ? `/api/v1/stream/prices?stations=${encodeURIComponent(stations)}`
    : '/api/v1/stream/prices';

  const upstream = await fetch(`${BACKEND_URL}${upstreamPath}`, {
    method: 'GET',
    headers: {
      'X-API-Key': API_KEY,
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    // Streaming requires this option — Node's undici fetch supports it natively.
    signal: request.signal,
  });

  if (!upstream.ok || !upstream.body) {
    return new Response(
      JSON.stringify({ error: 'Stream backend unavailable', status: upstream.status }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Pipe upstream chunks straight to the client.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disables proxy buffering on Caddy / Nginx.
      'X-Accel-Buffering': 'no',
    },
  });
}
