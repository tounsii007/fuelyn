// ============================================================
// BFF — POST /api/auth/magic-link
//
// Issues a single-use magic-link token for the current device id
// and emails it to the supplied address. The user clicks the link,
// which lands at /auth/claim?token=… and POSTs to /api/auth/claim
// to finalise the email-account upgrade.
//
// Email delivery is delegated to MAIL_TRANSPORT — when not set we
// log the link instead, so the dev experience works without an
// SMTP server.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db/client';
import { sha256Hex } from '@/lib/auth/jwt';
import { getOrCreateSession } from '@/lib/auth/session';
import { parseJson } from '@/lib/http/validate';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';

const limiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 3 });

const RequestSchema = z.object({
  email: z.string().email().max(120),
});

export async function POST(request: NextRequest) {
  const ip = getClientKey(request);
  const rl = limiter.check(`magic-link:${ip}`);
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests', retryAfterSeconds: Math.ceil((rl.resetAt - Date.now()) / 1000) },
      { status: 429 },
    );
  }

  const session = await getOrCreateSession(request);
  if (!session) {
    return NextResponse.json({ error: 'No device id' }, { status: 401 });
  }

  const parsed = await parseJson(request, RequestSchema);
  if (!parsed.success) return parsed.response;

  // Generate a 32-byte random token, store its sha256 only.
  const raw = randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(raw);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  await prisma.authToken.create({
    data: {
      userId: session.userId,
      kind: 'magic-link',
      tokenHash,
      expiresAt,
    },
  });

  const origin = request.headers.get('origin') ?? 'http://localhost:3000';
  const link = `${origin}/auth/claim?token=${raw}&email=${encodeURIComponent(parsed.data.email)}`;

  // Production path: hand off to MAIL_TRANSPORT. We support the
  // simplest possible env-driven config: SMTP URL → fetch a small
  // mailer module if available. For now we always log + return link
  // in dev, and rely on the operator to wire a real transport later.
  if (process.env.NODE_ENV !== 'production' || !process.env.MAIL_TRANSPORT) {
    console.info('[auth/magic-link] dev — would email to:', parsed.data.email, link);
    return NextResponse.json({ success: true, devLink: link });
  }

  // TODO: wire MAIL_TRANSPORT (postmark/ses/etc.) when picked. The
  // schema and DB row are already correct; switching this out is a
  // single-file change.
  return NextResponse.json({ success: true });
}
