// ============================================================
// CSRF / same-origin enforcement (Iter AH).
//
// SameSite=Lax cookies blunt classic form-CSRF but don't stop
// cookie-bearing JSON POSTs from same-eTLD-but-different-subdomain
// pages. We add a belt-and-braces check on every state-changing
// endpoint:
//
//   1. The Origin header (or, fallback, the Referer host) MUST
//      match an entry in allowedOrigins(). Browsers always send
//      one of these for cross-origin POST.
//   2. A custom header `X-Fuelyn-Csrf: 1` MUST be present.
//      Custom headers can't be set by a vanilla form post, and
//      cross-origin AJAX requires CORS preflight which we never
//      whitelist.
//
// Returns null when allowed, otherwise a NextResponse 403.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { allowedOrigins } from '@/lib/config/runtime';

export const CSRF_HEADER = 'x-fuelyn-csrf';

/**
 * Enforce same-origin + custom-header on a state-changing request.
 * Returns null on success, a 403 NextResponse on rejection.
 */
export function enforceSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const csrfHeader = request.headers.get(CSRF_HEADER);

  const allowed = new Set(allowedOrigins());

  // Custom header must be present and "1".
  if (csrfHeader !== '1') {
    return NextResponse.json(
      { error: 'Missing CSRF header' },
      { status: 403 },
    );
  }

  // Origin (preferred) or Referer host must be in the allow-list.
  if (origin && !allowed.has(origin)) {
    return NextResponse.json(
      { error: 'Origin not allowed' },
      { status: 403 },
    );
  }
  if (!origin && referer) {
    let refererOrigin: string | null = null;
    try {
      const u = new URL(referer);
      refererOrigin = `${u.protocol}//${u.host}`;
    } catch {
      // ignore
    }
    if (!refererOrigin || !allowed.has(refererOrigin)) {
      return NextResponse.json(
        { error: 'Referer not allowed' },
        { status: 403 },
      );
    }
  }

  return null;
}
