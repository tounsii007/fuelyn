// ============================================================
// BFF — POST /api/auth/claim
//
// Single-use magic-link redemption. The user posts the raw token
// from the email; the server hashes it, looks up the matching
// AuthToken, marks it consumed, and either:
//   * upgrades the device's anonymous User row with an email
//     (one-step upgrade — most common case)
//   * merges this device into an existing email-claimed User
//     (multi-device sign-in — moves SyncRecords across)
//
// Every redemption mints a fresh session JWT.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/client';
import { sha256Hex, signJwt } from '@/lib/auth/jwt';
import { buildSessionCookie } from '@/lib/auth/session';
import { enforceSameOrigin } from '@/lib/auth/csrf';
import { parseJson } from '@/lib/http/validate';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';

const limiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 10 });

// One opaque error message for every pre-success branch — denies
// attackers an enumeration oracle on token existence / email
// existence / expiry state.
const GENERIC_REJECT = NextResponse.json(
  { error: 'Invalid or expired link' },
  { status: 400 },
);

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const RequestSchema = z.object({
  token: z.string().min(20).max(200),
  email: z.string().email().max(120),
});

export async function POST(request: NextRequest) {
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  // Per-IP rate limit caps brute-force + enumeration attempts even
  // though 32-byte tokens are infeasible to guess by chance.
  const ip = getClientKey(request);
  const rl = await limiter.check(`claim:${ip}`);
  if (rl.limited) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }

  const parsed = await parseJson(request, RequestSchema);
  if (!parsed.success) return parsed.response;

  // Every pre-success rejection returns the SAME error/status so the
  // caller can't distinguish "token unknown" from "token expired"
  // from "user vanished" — closes the email-enumeration oracle.
  const tokenHash = sha256Hex(parsed.data.token);
  const auth = await prisma.authToken.findUnique({ where: { tokenHash } });
  if (!auth || auth.kind !== 'magic-link' || auth.consumedAt) {
    return GENERIC_REJECT;
  }
  if (auth.expiresAt.getTime() <= Date.now()) {
    return GENERIC_REJECT;
  }

  // The email is bound to the token when the link is issued. A token
  // may only be redeemed for the exact address it was mailed to —
  // resolve the target account from the token's own email, never the
  // request body. Trusting the body would let an attacker redeem a
  // valid link (issued for an address they control) against any other
  // account by passing the victim's email here (account takeover).
  if (!auth.email || auth.email !== parsed.data.email) {
    return GENERIC_REJECT;
  }

  // The User who originally requested the magic link.
  const requestingUser = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, email: true, deviceId: true },
  });
  if (!requestingUser) {
    return GENERIC_REJECT;
  }

  // If another User already owns this email, we MERGE: every
  // SyncRecord from the requesting user moves to the target user
  // and the requesting (anonymous) user is deleted. Otherwise we
  // simply upgrade the requesting user.
  const existingByEmail = await prisma.user.findUnique({
    where: { email: parsed.data.email },
    select: { id: true },
  });

  let userId: string;
  if (existingByEmail && existingByEmail.id !== requestingUser.id) {
    await prisma.$transaction([
      prisma.syncRecord.updateMany({
        where: { userId: requestingUser.id },
        data: { userId: existingByEmail.id },
      }),
      prisma.user.delete({ where: { id: requestingUser.id } }),
      prisma.authToken.update({
        where: { id: auth.id },
        data: { consumedAt: new Date() },
      }),
    ]);
    userId = existingByEmail.id;
  } else {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: requestingUser.id },
        data: { email: parsed.data.email },
      }),
      prisma.authToken.update({
        where: { id: auth.id },
        data: { consumedAt: new Date() },
      }),
    ]);
    userId = requestingUser.id;
  }

  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({ sub: userId, exp: now + SESSION_TTL_SECONDS, typ: 'session' });

  const res = NextResponse.json({ success: true, userId, email: parsed.data.email });
  res.headers.set('Set-Cookie', buildSessionCookie(token));
  return res;
}
