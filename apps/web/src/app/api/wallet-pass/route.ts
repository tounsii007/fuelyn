// ============================================================
// BFF — POST /api/wallet-pass
// Builds the Apple Wallet + Google Wallet pass JSON for one
// station/deal. Returns both payloads so the client picks
// whichever its platform supports.
//
// Real-world deployment will need:
//   * Apple pass-type-id certificate to sign the .pkpass manifest
//   * Google Wallet service account key to sign the JWT save URL
// Both live OUTSIDE the client bundle. This endpoint serves the
// unsigned JSON shape so a future `/api/wallet-pass/sign` route
// can wrap it with the platform-specific signature step.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildWalletPass } from '@fuelyn/core';
import { parseJson } from '@/lib/http/validate';
import { enforceSameOrigin } from '@/lib/auth/csrf';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';
import { allowedOrigins } from '@/lib/config/runtime';

const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });

const RequestSchema = z.object({
  stationId: z.string().min(1).max(120),
  stationLabel: z.string().min(1).max(200),
  cityLine: z.string().max(200).optional(),
  fuelLabel: z.string().min(1).max(40),
  priceEurPerL: z.string().min(1).max(20),
  distanceLabel: z.string().max(20).optional(),
  locale: z.string().min(2).max(10).optional(),
  deepLink: z.string().url(),
  passTypeIdentifier: z.string().optional(),
  teamIdentifier: z.string().optional(),
  backgroundColorHex: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
});

export async function POST(request: NextRequest) {
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const ip = getClientKey(request);
  const rl = await limiter.check(`wallet:${ip}`);
  if (rl.limited) return NextResponse.json({ error: 'rate limit' }, { status: 429 });

  const parsed = await parseJson(request, RequestSchema);
  if (!parsed.success) return parsed.response;

  // Reject deepLinks that aren't on our own origin — otherwise an
  // attacker could trick a user into installing a wallet pass whose
  // QR code points at a phishing page.
  const origins = new Set(allowedOrigins());
  const allowed: boolean = (() => {
    try {
      const u = new URL(parsed.data.deepLink);
      return origins.has(`${u.protocol}//${u.host}`);
    } catch {
      return false;
    }
  })();
  if (!allowed) {
    return NextResponse.json(
      { error: 'deepLink must point to this app' },
      { status: 400 },
    );
  }

  const result = buildWalletPass(parsed.data);
  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'no-store', // pass content is per-request
    },
  });
}
