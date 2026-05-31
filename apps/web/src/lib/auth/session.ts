// ============================================================
// Session helpers — find-or-create-by-device-id, issue JWT,
// extract user from request.
//
// Anonymous-first auth model:
//   * Client generates a random `deviceId` on first launch and
//     stores it in localStorage.
//   * On every sync request, the deviceId is sent in the
//     X-Fuelyn-Device header.
//   * Server upserts the User row keyed by deviceId, mints a
//     short-lived session JWT, and writes it as an HttpOnly
//     cookie + returns it for native shells.
//
// Optionally upgradable: /api/auth/magic-link claims a User
// (by deviceId) for an email address. Subsequent logins from
// any device can then sign back into the same User.
// ============================================================

import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/client';
import { signJwt, verifyJwt } from './jwt';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';
import { isProduction } from '@/lib/config/runtime';

// Per-IP cap on first-contact User creation. Without this an attacker
// rotating X-Fuelyn-Device values can fill the User table at line speed.
// The cap is generous enough to let real users open the app from
// multiple browsers on the same NAT, but harsh enough to make a
// disk-fill attack uneconomical.
const userCreationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,                   // 10 new device-id upserts / IP / hour
});

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const SESSION_COOKIE = 'fuelyn_session';
export const DEVICE_HEADER = 'x-fuelyn-device';
export const SESSION_HEADER = 'authorization';

export interface SessionResult {
  userId: string;
  /** Newly-minted JWT to send back to the client, when a refresh happened. */
  newToken?: string;
}

/**
 * Resolve the calling user from a request, creating an anonymous
 * User row on first contact. Returns null only if the request is
 * malformed (no device id AND no valid session token).
 */
export async function getOrCreateSession(
  request: NextRequest,
): Promise<SessionResult | null> {
  // 1) Try the bearer token first.
  const auth = request.headers.get(SESSION_HEADER);
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value;
  const token = (auth?.startsWith('Bearer ') ? auth.slice(7) : null) ?? cookieToken;

  if (token) {
    const v = verifyJwt(token, 'session');
    if (v.valid && v.claims) {
      // No need to re-issue; client cookie is still good.
      return { userId: v.claims.sub };
    }
  }

  // 2) Fall back to deviceId — used by clean installs / native shells
  //    that don't carry a cookie.
  const deviceId = request.headers.get(DEVICE_HEADER);
  if (!deviceId || deviceId.length < 8 || deviceId.length > 64) return null;
  // Reject device ids that aren't [a-zA-Z0-9-_]+ — neutralises any
  // attempt to smuggle SQL/header-injection bytes through the upsert.
  if (!/^[a-zA-Z0-9_-]+$/.test(deviceId)) return null;

  // Existing-user lookups are free; only NEW user creations consume
  // the per-IP budget. Keeps real users on shared NATs unaffected.
  const existing = await prisma.user.findUnique({
    where: { deviceId },
    select: { id: true },
  });

  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    const ip = getClientKey(request);
    const rl = await userCreationLimiter.check(`user-create:${ip}`);
    if (rl.limited) {
      // Don't even hit the DB — log and reject. The user-creation
      // cap is the line of defence against unbounded User row growth.
      console.warn('[fuelyn-auth] user-create rate limit hit for', ip);
      return null;
    }
    const created = await prisma.user.create({
      data: { deviceId },
      select: { id: true },
    });
    userId = created.id;
  }
  const user = { id: userId };
  // Sanity: every prod deploy must have a JWT secret. We re-check
  // here (cheap) so a runtime cycle that swapped envs notices fast.
  if (isProduction() && !process.env.FUELYN_JWT_SECRET) {
    throw new Error('[fuelyn-auth] FUELYN_JWT_SECRET missing at session-mint time');
  }

  const now = Math.floor(Date.now() / 1000);
  const newToken = signJwt({
    sub: user.id,
    exp: now + SESSION_TTL_SECONDS,
    typ: 'session',
  });

  return { userId: user.id, newToken };
}

/**
 * Standard set-cookie header so a route handler can attach the
 * fresh session token to the response.
 */
export function buildSessionCookie(token: string): string {
  const maxAge = SESSION_TTL_SECONDS;
  // Note: SameSite=Lax (not Strict) so the cookie travels on
  // top-level navigations from email magic links.
  const flags = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
    process.env.NODE_ENV === 'production' ? 'Secure' : '',
  ].filter(Boolean);
  return flags.join('; ');
}
