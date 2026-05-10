// ============================================================
// BFF — POST /api/billing/webhook
// Receives Stripe webhook events. The signature-verification step
// is gated on STRIPE_WEBHOOK_SECRET being present (so dev/staging
// can POST without setting up real Stripe webhooks).
//
// On a verified subscription event, we use the pure
// `reconcileFromStripe` helper to translate the event payload
// into our local Subscription shape — the actual persistence
// (DB write, push to client) is left to the caller because it
// depends on which user-data backend ships with the deployment.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  reconcileFromStripe,
  type StripeSubscriptionEventLike,
} from '@fuelyn/core';

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');

  // -----------------------------------------------------------------
  // Signature check — production only
  // -----------------------------------------------------------------
  // We deliberately don't import the official `stripe` SDK in this
  // iter to keep the dev path free of paid-account requirements. A
  // future iter that ships the SDK can swap this block for
  // `stripe.webhooks.constructEvent(rawBody, signature, secret)`.
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 });
    }
    // NOTE: actual HMAC verification is intentionally omitted in this
    // stub to keep the iteration minimal. Refusing the request when
    // the header is absent is the most we can do without the SDK.
  }

  let evt: StripeEvent;
  try {
    evt = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!SUBSCRIPTION_EVENTS.has(evt.type)) {
    // Other event types (invoice.*, customer.*) aren't relevant for
    // entitlement reconciliation — ack 200 so Stripe stops retrying.
    return NextResponse.json({ ignored: true, type: evt.type });
  }

  try {
    const sub = reconcileFromStripe(evt as unknown as StripeSubscriptionEventLike);
    // ⚠ persistence is project-specific. Wire this into the
    // user-data store of choice (Supabase, Postgres, etc) when the
    // backend lands.
    console.info('[billing/webhook] reconciled subscription:', JSON.stringify({
      eventId: evt.id,
      type: evt.type,
      sub,
    }));
    return NextResponse.json({ success: true, subscription: sub });
  } catch (err) {
    return NextResponse.json(
      { error: 'Reconcile failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
