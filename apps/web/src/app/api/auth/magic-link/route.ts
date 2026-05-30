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
import { enforceSameOrigin } from '@/lib/auth/csrf';
import { parseJson } from '@/lib/http/validate';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';
import { isProduction, publicAppOrigin } from '@/lib/config/runtime';

const limiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 3 });

const RequestSchema = z.object({
  email: z.string().email().max(120),
});

export async function POST(request: NextRequest) {
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

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

  // Refuse to process magic-link requests in production without a
  // real mail transport — otherwise the dev branch (which echoes the
  // link in the response body) would let any caller take over any
  // email address by reading their own response.
  if (isProduction() && !process.env.MAIL_TRANSPORT) {
    return NextResponse.json(
      { error: 'Mail transport not configured' },
      { status: 503 },
    );
  }

  // Generate a 32-byte random token, store its sha256 only.
  const raw = randomBytes(32).toString('base64url');
  const tokenHash = sha256Hex(raw);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 min

  await prisma.authToken.create({
    data: {
      userId: session.userId,
      kind: 'magic-link',
      tokenHash,
      email: parsed.data.email,
      expiresAt,
    },
  });

  // CRITICAL: build the magic link with the SERVER-CONFIGURED origin.
  // Never use request.headers.get('origin') — attacker-controlled and
  // would let evil.example craft a link mailed to victim@example.com
  // pointing at evil.example/auth/claim.
  const origin = publicAppOrigin();
  const link = `${origin}/auth/claim?token=${raw}&email=${encodeURIComponent(parsed.data.email)}`;

  if (!isProduction()) {
    // Development convenience — print + echo the link in the response
    // body. Production refused the request earlier if MAIL_TRANSPORT
    // wasn't set, so this branch only runs in a local dev setup.
    console.info('[auth/magic-link] dev — would email to:', parsed.data.email, link);
    return NextResponse.json({ success: true, devLink: link });
  }

  // TODO: wire MAIL_TRANSPORT (postmark/ses/etc.) when picked. The
  // schema and DB row are already correct; switching this out is a
  // single-file change.
  return NextResponse.json({ success: true });
}
