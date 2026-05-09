// ============================================================
// Next.js Edge Middleware — security headers + request correlation.
//
// Runs at the edge (no Node APIs) for every non-API request. Adds:
//   • Content-Security-Policy (without nonces — see note below)
//   • Strict-Transport-Security
//   • X-Content-Type-Options, X-Frame-Options, Referrer-Policy
//   • Permissions-Policy
//   • X-Request-Id (propagated to BFF/backend so logs correlate)
//
// ─── CSP design note ─────────────────────────────────────────
// We chose 'unsafe-inline' for script-src + style-src instead of the
// stricter nonce/strict-dynamic approach because:
//
//   1. Next.js 16 emits multiple inline + chunked <script> tags during
//      hydration. With 'strict-dynamic', the nonce must propagate to
//      every one of them. Next.js does not do this automatically — you
//      need a manual `headers()` lookup in every layout/page that
//      renders <Script> tags. Easy to break, hard to test.
//
//   2. With Tailwind v4 + emotion-style runtime, inline styles are
//      unavoidable, so 'unsafe-inline' for style-src is required anyway.
//
//   3. The app is single-origin (no third-party scripts), so the actual
//      threat surface for injection is small. We mitigate the residual
//      risk through `default-src 'self'` and explicit allow-lists for
//      every external host (fonts, map tiles, Tankerkoenig, etc.).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

function buildCsp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // Tailwind v4 + Next emits inline <style> tags during hydration.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.tile.opentopomap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://creativecommons.tankerkoenig.de",
    // Map tiles fetched by the service worker via fetch() go through
    // `connect-src`, not `img-src`. List every tile CDN the StationMap
    // can switch between (light / dark / satellite / terrain).
    "connect-src 'self' https://creativecommons.tankerkoenig.de https://api.openchargemap.io https://api.openai.com https://nominatim.openstreetmap.org https://router.project-osrm.org https://*.tile.openstreetmap.org https://*.tile.opentopomap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join('; ');
}

function generateRequestId(): string {
  return crypto.randomUUID();
}

export function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? generateRequestId();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set('Content-Security-Policy', buildCsp());
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()',
  );
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  );
  response.headers.set('X-Request-Id', requestId);

  return response;
}

export const config = {
  matcher: [
    // Run on every page, but skip:
    //   • /api    (BFF routes — they manage their own headers/CORS)
    //   • Next assets (already integrity-checked by webpack hashes)
    //   • Static metadata files
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|\\.well-known).*)',
  ],
};
