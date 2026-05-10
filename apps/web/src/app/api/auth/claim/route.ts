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
import { parseJson } from '@/lib/http/validate';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const RequestSchema = z.object({
  token: z.string().min(20).max(200),
  email: z.string().email().max(120),
});

export async function POST(request: NextRequest) {
  const parsed = await parseJson(request, RequestSchema);
  if (!parsed.success) return parsed.response;

  const tokenHash = sha256Hex(parsed.data.token);
  const auth = await prisma.authToken.findUnique({ where: { tokenHash } });
  if (!auth || auth.kind !== 'magic-link' || auth.consumedAt) {
    return NextResponse.json({ error: 'Invalid or used token' }, { status: 400 });
  }
  if (auth.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: 'Expired token' }, { status: 400 });
  }

  // The User who originally requested the magic link.
  const requestingUser = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { id: true, email: true, deviceId: true },
  });
  if (!requestingUser) {
    return NextResponse.json({ error: 'User vanished' }, { status: 400 });
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
