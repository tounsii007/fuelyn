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
  } else {
    console.warn('[billing/webhook] STRIPE_WEBHOOK_SECRET not set — accepting unsigned payload');
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
  // The User row is keyed by stripeCustomerId. If we don't have a
  // matching User yet (e.g. the customer was created out-of-band),
  // we create a placeholder anonymous row so the next sync from any
  // device that supplies the same customer id will resolve to it.
  if (sub.stripeCustomerId) {
    const updateData = {
      subscriptionStatus: sub.status,
      subscriptionPlan: sub.plan ?? null,
      subscriptionPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
    };
    try {
      await prisma.user.upsert({
        where: { stripeCustomerId: sub.stripeCustomerId },
        update: updateData,
        create: {
          stripeCustomerId: sub.stripeCustomerId,
          ...updateData,
        },
      });
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
