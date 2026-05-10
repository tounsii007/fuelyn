// ============================================================
// BFF — POST /api/billing/webhook (Iter X — production)
//
// Pipeline:
//   1) Read raw body (CRITICAL: Stripe signs the bytes; any
//      JSON.parse + re-stringify breaks the HMAC).
//   2) Verify Stripe-Signature with our own HS256 implementation
//      (no SDK dep).
//   3) Translate subscription.* events through reconcileFromStripe
//      from @fuelyn/core.
//   4) Persist to the User table via Prisma — single source of
//      truth for entitlement state.
//
// Dev / no-secret path: when STRIPE_WEBHOOK_SECRET is unset we
// accept payloads without signature verification but log a warning,
// so /staging environments can be exercised end-to-end without
// real Stripe credentials.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import {
  reconcileFromStripe,
  type StripeSubscriptionEventLike,
} from '@fuelyn/core';
import { verifyStripeSignature } from '@/lib/billing/stripe-signature';
import { prisma } from '@/lib/db/client';
import { isProduction } from '@/lib/config/runtime';

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
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (secret) {
    const v = verifyStripeSignature(rawBody, signature, secret);
    if (!v.valid) {
      return NextResponse.json(
        { error: `Webhook signature ${v.reason}` },
        { status: 400 },
      );
    }
  } else if (isProduction()) {
    // In production we MUST verify. An unsigned webhook accepted in
    // production lets anyone forge a subscription.created event for
    // any customer id and grant themselves premium.
    return NextResponse.json(
      { error: 'STRIPE_WEBHOOK_SECRET not configured' },
      { status: 503 },
    );
  } else {
    console.warn('[billing/webhook] STRIPE_WEBHOOK_SECRET not set — dev mode accepts unsigned payload');
  }

  let evt: StripeEvent;
  try {
    evt = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!SUBSCRIPTION_EVENTS.has(evt.type)) {
    return NextResponse.json({ ignored: true, type: evt.type });
  }

  let sub: ReturnType<typeof reconcileFromStripe>;
  try {
    sub = reconcileFromStripe(evt as unknown as StripeSubscriptionEventLike);
  } catch (err) {
    return NextResponse.json(
      { error: 'Reconcile failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  // -------- Persistence --------
  // CRITICAL: update-only. We must NOT create a new User row from a
  // webhook payload — the customer id is the only thing the event
  // carries, and an attacker (or even a real Stripe event delivered
  // to the wrong env) could conjure a fresh User with active
  // subscription out of thin air. The User row was created during
  // the /billing/checkout flow which pinned client_reference_id to
  // the authenticated session; if we don't find a match here, the
  // event is for someone else's deployment / a stale customer.
  if (sub.stripeCustomerId) {
    const updateData = {
      subscriptionStatus: sub.status,
      subscriptionPlan: sub.plan ?? null,
      subscriptionPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
    };
    try {
      const result = await prisma.user.updateMany({
        where: { stripeCustomerId: sub.stripeCustomerId },
        data: updateData,
      });
      if (result.count === 0) {
        // No user owns this customer id. Acknowledge so Stripe stops
        // retrying, but log loudly — this is the canary for either a
        // dev-event hitting prod or a legitimate customer created
        // outside our checkout flow.
        console.warn(
          '[billing/webhook] event for unknown customer id (ignored):',
          sub.stripeCustomerId,
        );
        return NextResponse.json({ ignored: true, reason: 'unknown-customer' });
      }
    } catch (err) {
      console.error('[billing/webhook] db write failed:', err);
      // Stripe will retry — we'd rather 5xx than ack-and-lose.
      return NextResponse.json({ error: 'persist failed' }, { status: 500 });
    }
  }

  console.info('[billing/webhook] reconciled subscription:', JSON.stringify({
    eventId: evt.id,
    type: evt.type,
    sub,
  }));

  // Push the new state to every device of the user via the sync table
  // (so the next /api/sync GET returns it without a manual refresh).
  if (sub.stripeCustomerId) {
    try {
      const user = await prisma.user.findUnique({
        where: { stripeCustomerId: sub.stripeCustomerId },
        select: { id: true },
      });
      if (user) {
        await prisma.syncRecord.upsert({
          where: { userId_kind: { userId: user.id, kind: 'subscription' } },
          update: { payload: JSON.stringify(sub) },
          create: { userId: user.id, kind: 'subscription', payload: JSON.stringify(sub) },
        });
      }
    } catch {
      // non-fatal — webhook still succeeded
    }
  }

  return NextResponse.json({ success: true, subscription: sub });
}
