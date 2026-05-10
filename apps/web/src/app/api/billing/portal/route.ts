// ============================================================
// BFF — POST /api/billing/portal (Iter X)
//
// Opens the Stripe Customer Portal for the calling user (so they
// can update their card, cancel, see invoices, …). We resolve the
// stripeCustomerId from the User table; if none exists yet, we
// return a 412 so the UI knows to nudge the user through checkout
// first.
//
// Dev path (no STRIPE_SECRET_KEY): echoes a stub URL so the
// "Manage subscription" button still routes somewhere meaningful.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { getOrCreateSession } from '@/lib/auth/session';
import { enforceSameOrigin } from '@/lib/auth/csrf';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';
import { publicAppOrigin } from '@/lib/config/runtime';

const limiter = createRateLimiter({ windowMs: 60_000, max: 10 });

export async function POST(request: NextRequest) {
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const ip = getClientKey(request);
  const rl = limiter.check(`portal:${ip}`);
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 },
    );
  }

  const session = await getOrCreateSession(request);
  if (!session) return NextResponse.json({ error: 'No device id' }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { stripeCustomerId: true },
  });
  if (!user?.stripeCustomerId) {
    return NextResponse.json(
      { error: 'No Stripe customer for this user' },
      { status: 412 },
    );
  }

  // CRITICAL: never use the request's Origin header for the return URL —
  // attacker-controlled. Always use the configured app origin.
  const returnUrl = `${publicAppOrigin()}/settings?source=portal-return`;

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({
      success: true,
      stub: true,
      url: '/settings?source=stub-portal',
    });
  }

  try {
    const body = new URLSearchParams();
    body.set('customer', user.stripeCustomerId);
    body.set('return_url', returnUrl);

    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: 'Stripe rejected portal session', detail: text },
        { status: 502 },
      );
    }
    const json = await res.json();
    return NextResponse.json({ success: true, url: json.url });
  } catch (err) {
    return NextResponse.json(
      { error: 'Portal creation failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
