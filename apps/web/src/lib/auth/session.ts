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

  // Atomic upsert keeps the User table free of duplicate rows even
  // under racing first requests.
  const user = await prisma.user.upsert({
    where: { deviceId },
    update: {},
    create: { deviceId },
    select: { id: true },
  });

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
