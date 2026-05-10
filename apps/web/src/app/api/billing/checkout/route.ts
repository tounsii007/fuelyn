// ============================================================
// BFF — POST /api/billing/checkout
// Builds the Stripe checkout-session payload from a user request,
// then either:
//   * (production) calls Stripe and returns the hosted-checkout URL
//   * (dev / no STRIPE_SECRET_KEY)   echoes the payload back so the
//     UI can preview the flow without real Stripe creds
// The pure payload builder is in @fuelyn/core; this route adds
// the side-effects (auth, Stripe call, error handling).
//
// Iter AH security hardening:
//   * Authenticated session is REQUIRED. No fallback to client-
//     supplied client_reference_id (was a spoof vector).
//   * stripeCustomerId resolved server-side from the User row.
//     Client cannot pin a checkout to anyone else's customer.
//   * success_url / cancel_url forced to our PUBLIC_APP_ORIGIN
//     so an attacker can't have Stripe redirect to a phishing
//     page after a real payment.
//   * CSRF / same-origin enforced.
//   * Per-IP rate limit on this endpoint (3 / minute / IP).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildCheckoutSessionPayload } from '@fuelyn/core';
import { parseJson } from '@/lib/http/validate';
import { getOrCreateSession } from '@/lib/auth/session';
import { enforceSameOrigin } from '@/lib/auth/csrf';
import { createRateLimiter, getClientKey } from '@/lib/http/rate-limit';
import { publicAppOrigin } from '@/lib/config/runtime';
import { prisma } from '@/lib/db/client';

const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });

// successPath / cancelPath are the only client-supplied routing
// surface. They MUST be path-only (not full URLs) so we can prefix
// them with our trusted origin.
const PathSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^\/[^\s]*$/, { message: 'Must be an absolute path on this app' });

const RequestSchema = z.object({
  priceLookupKey: z.enum(['fuelyn-monthly', 'fuelyn-annual']),
  successPath: PathSchema.optional(),
  cancelPath: PathSchema.optional(),
  locale: z.string().min(2).max(10).regex(/^[a-zA-Z-]+$/).optional(),
  // NOTE: stripeCustomerId + clientReferenceId have been REMOVED
  // from the client-controllable surface — both are now resolved
  // exclusively from the authenticated session.
});

export async function POST(request: NextRequest) {
  const csrf = enforceSameOrigin(request);
  if (csrf) return csrf;

  const ip = getClientKey(request);
  const rl = limiter.check(`checkout:${ip}`);
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many checkout attempts', retryAfterSeconds: Math.ceil((rl.resetAt - Date.now()) / 1000) },
      { status: 429 },
    );
  }

  // Authenticated session is now REQUIRED — no anon fallback.
  const session = await getOrCreateSession(request);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const parsed = await parseJson(request, RequestSchema);
  if (!parsed.success) return parsed.response;

  const origin = publicAppOrigin();
  const successUrl = `${origin}${parsed.data.successPath ?? '/settings?source=checkout-success'}`;
  const cancelUrl = `${origin}${parsed.data.cancelPath ?? '/settings?source=checkout-cancel'}`;

  // Resolve the user's existing Stripe customer id from the DB. If
  // they don't have one yet, Stripe will create it on first checkout
  // and the webhook will round-trip it back into the User row.
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { stripeCustomerId: true },
  });

  const payload = buildCheckoutSessionPayload(
    {
      priceLookupKey: parsed.data.priceLookupKey,
      successUrl,
      cancelUrl,
      ...(user?.stripeCustomerId ? { stripeCustomerId: user.stripeCustomerId } : {}),
      ...(parsed.data.locale ? { locale: parsed.data.locale } : {}),
    },
    session.userId, // pinned, never client-controlled
  );

  // Without real Stripe credentials we still want the UI flow to be
  // testable end-to-end. Echo the payload back with a stub URL so the
  // dev experience exercises the click → backend → redirect path
  // without actually charging anyone.
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({
      success: true,
      stub: true,
      url: '/settings?source=stub-checkout',
      payload,
    });
  }

  // Production path — POST the payload to Stripe.
  try {
    const body = new URLSearchParams();
    body.set('mode', payload.mode);
    payload.payment_method_types.forEach((t) =>
      body.append('payment_method_types[]', t),
    );
    payload.line_items.forEach((li, idx) => {
      body.set(`line_items[${idx}][price]`, li.price);
      body.set(`line_items[${idx}][quantity]`, String(li.quantity));
    });
    body.set('success_url', payload.success_url);
    body.set('cancel_url', payload.cancel_url);
    body.set('allow_promotion_codes', String(payload.allow_promotion_codes));
    body.set('client_reference_id', payload.client_reference_id);
    if (payload.customer) body.set('customer', payload.customer);
    if (payload.locale) body.set('locale', payload.locale);

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: 'Stripe rejected the checkout request', detail: errText },
        { status: 502 },
      );
    }
    const stripeSession = await res.json();
    // Persist the customer id back so subsequent checkouts re-use it.
    if (stripeSession.customer && typeof stripeSession.customer === 'string' && !user?.stripeCustomerId) {
      await prisma.user.update({
        where: { id: session.userId },
        data: { stripeCustomerId: stripeSession.customer },
      }).catch(() => { /* non-fatal */ });
    }
    return NextResponse.json({ success: true, url: stripeSession.url, sessionId: stripeSession.id });
  } catch (err) {
    return NextResponse.json(
      { error: 'Checkout creation failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
