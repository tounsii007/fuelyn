// ============================================================
// BFF — POST /api/billing/checkout
// Builds the Stripe checkout-session payload from a user request,
// then either:
//   * (production) calls Stripe and returns the hosted-checkout URL
//   * (dev / no STRIPE_SECRET_KEY)   echoes the payload back so the
//     UI can preview the flow without real Stripe creds
// The pure payload builder is in @fuelyn/core; this route adds
// the side-effects (auth, Stripe call, error handling).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildCheckoutSessionPayload } from '@fuelyn/core';
import { parseJson } from '@/lib/http/validate';
import { getOrCreateSession } from '@/lib/auth/session';

const RequestSchema = z.object({
  priceLookupKey: z.enum(['fuelyn-monthly', 'fuelyn-annual']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  stripeCustomerId: z.string().optional(),
  locale: z.string().min(2).max(10).optional(),
  /** Stable id for the requesting user — Stripe stores it on the session. */
  clientReferenceId: z.string().min(1).max(120),
});

export async function POST(request: NextRequest) {
  const parsed = await parseJson(request, RequestSchema);
  if (!parsed.success) return parsed.response;

  // Resolve the calling user so we can pin client_reference_id to a
  // real DB id (overriding any client-supplied value, which would
  // otherwise be a spoof vector).
  const session = await getOrCreateSession(request);
  const clientRef = session?.userId ?? parsed.data.clientReferenceId;

  const payload = buildCheckoutSessionPayload(parsed.data, clientRef);

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

  // Production path — POST the payload to Stripe. Kept inline so the
  // entire billing surface lives in one file; if/when we add the
  // Stripe SDK as a dependency we can swap this for `stripe.checkout
  // .sessions.create(payload)`.
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
    const session = await res.json();
    return NextResponse.json({ success: true, url: session.url, sessionId: session.id });
  } catch (err) {
    return NextResponse.json(
      { error: 'Checkout creation failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
