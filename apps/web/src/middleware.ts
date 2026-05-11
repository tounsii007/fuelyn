// ============================================================
// Next.js Edge Middleware — security headers + request correlation.
//
// Runs at the edge (no Node APIs) for every non-API request. Adds:
//   • Content-Security-Policy (see note below)
//   • Strict-Transport-Security
//   • X-Content-Type-Options, X-Frame-Options, Referrer-Policy
//   • Permissions-Policy
//   • X-Request-Id (propagated to BFF/backend so logs correlate)
//
// ─── CSP design note ─────────────────────────────────────────
//   1. 'unsafe-eval' is enabled ONLY in development (HMR/refresh
//      needs it). Production drops it — Next.js production bundles
//      do not use eval().
//
//   2. 'unsafe-inline' for style-src is kept: Tailwind v4 + the Next
//      runtime emit inline <style> tags during hydration and there is
//      no nonce-aware path that covers all of them. For script-src we
//      keep 'unsafe-inline' for the same hydration reason (chunked
//      <script> tags) but the app loads zero third-party scripts, so
//      the attack surface is the same-origin code we already trust.
//
//   3. connect-src lists only hosts the *browser* actually contacts.
//      OpenAI is server-side only (apps/web/src/lib/ai/openai-client.ts)
//      and is therefore not listed.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

function buildCsp(): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

  return [
    "default-src 'self'",
    scriptSrc,
    // Tailwind v4 + Next emits inline <style> tags during hydration.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.tile.opentopomap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://creativecommons.tankerkoenig.de",
    // Map tiles fetched by the service worker via fetch() go through
    // `connect-src`, not `img-src`. List every tile CDN the StationMap
    // can switch between (light / dark / satellite / terrain), plus
    // the OSRM routing API used by the navigation panel and the
    // route-planner page (RouteLayer hits it directly from the client).
    "connect-src 'self' https://creativecommons.tankerkoenig.de https://api.openchargemap.io https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org https://*.tile.opentopomap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://router.project-osrm.org",
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
  // Permissions-Policy — explicit allow-list per directive:
  //   geolocation: required for the user-location pulse + nearby search
  //   microphone:  required for VoiceCommandButton (Web Speech API)
  //   camera:      NOT required — the OCR flow uses <input capture>
  //                which doesn't gate on this directive. Keep closed.
  //   payment/usb/interest-cohort: nothing in the app uses these.
  response.headers.set(
    'Permissions-Policy',
    'geolocation=(self), microphone=(self), camera=(), payment=(), usb=(), interest-cohort=()',
  );
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload',
  );
  // Cross-origin isolation: nothing same-site embeds Fuelyn and no
  // window.open() popup workflow exists, so locking COOP/CORP to
  // same-origin protects against Spectre-style cross-window reads
  // without breaking any current feature. Do NOT set
  // Cross-Origin-Embedder-Policy: require-corp here — map tiles
  // come from third-party CDNs without the CORP header and would
  // be blocked.
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  // Block legacy Flash/Adobe cross-domain policy probes.
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
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
