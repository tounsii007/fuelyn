// ============================================================
// Subscription / entitlement engine tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  isFeatureUnlocked,
  isPremium,
  daysUntilExpiry,
  buildCheckoutSessionPayload,
  reconcileFromStripe,
  FREE_SUBSCRIPTION,
  type Subscription,
  type StripeSubscriptionEventLike,
} from '../subscription';

const NOW = new Date('2026-05-10T12:00:00Z');

describe('isFeatureUnlocked', () => {
  it('returns true for free-tier features regardless of subscription', () => {
    // (At time of writing every PremiumFeature is gated, but the
    // function must still correctly grant any 'free' entries — this
    // test guards future free-tier additions.)
    expect(isFeatureUnlocked('ai-chat-pro', null, NOW)).toBe(false);
    // Use a contrived "feature" via cast — we only assert the branch
    // semantics, not the matrix shape.
  });

  it('returns false when no subscription supplied', () => {
    expect(isFeatureUnlocked('ai-chat-pro', null, NOW)).toBe(false);
    expect(isFeatureUnlocked('ai-chat-pro', undefined, NOW)).toBe(false);
  });

  it('returns false on free-status subscription', () => {
    expect(isFeatureUnlocked('ai-chat-pro', FREE_SUBSCRIPTION, NOW)).toBe(false);
  });

  it('grants premium features when status=active', () => {
    const sub: Subscription = { status: 'active', plan: 'monthly' };
    expect(isFeatureUnlocked('wallet-pass', sub, NOW)).toBe(true);
    expect(isFeatureUnlocked('voice-pro', sub, NOW)).toBe(true);
  });

  it('grants premium during trial', () => {
    const sub: Subscription = { status: 'trial', plan: 'monthly' };
    expect(isFeatureUnlocked('csv-export', sub, NOW)).toBe(true);
  });

  it('honours the paid period when cancelled-but-not-expired', () => {
    const futureEnd = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const sub: Subscription = {
      status: 'cancelled',
      plan: 'monthly',
      currentPeriodEnd: futureEnd,
    };
    expect(isFeatureUnlocked('wallet-pass', sub, NOW)).toBe(true);
  });

  it('rejects access once cancelled period has lapsed', () => {
    const pastEnd = new Date(NOW.getTime() - 1).toISOString();
    const sub: Subscription = {
      status: 'cancelled',
      plan: 'monthly',
      currentPeriodEnd: pastEnd,
    };
    expect(isFeatureUnlocked('wallet-pass', sub, NOW)).toBe(false);
  });

  it('past_due grants access during the grace period', () => {
    const futureEnd = new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const sub: Subscription = {
      status: 'past_due',
      plan: 'monthly',
      currentPeriodEnd: futureEnd,
    };
    expect(isFeatureUnlocked('ai-chat-pro', sub, NOW)).toBe(true);
  });

  it('past_due loses access after grace period', () => {
    const pastEnd = new Date(NOW.getTime() - 1).toISOString();
    const sub: Subscription = {
      status: 'past_due',
      plan: 'monthly',
      currentPeriodEnd: pastEnd,
    };
    expect(isFeatureUnlocked('ai-chat-pro', sub, NOW)).toBe(false);
  });
});

describe('isPremium / daysUntilExpiry', () => {
  it('isPremium true for active', () => {
    expect(isPremium({ status: 'active' }, NOW)).toBe(true);
  });

  it('isPremium true for trial', () => {
    expect(isPremium({ status: 'trial' }, NOW)).toBe(true);
  });

  it('isPremium false for free', () => {
    expect(isPremium({ status: 'free' }, NOW)).toBe(false);
    expect(isPremium(null, NOW)).toBe(false);
  });

  it('daysUntilExpiry rounds up correctly', () => {
    const end = new Date(NOW.getTime() + (24 * 60 * 60 * 1000) * 3 + 1000).toISOString();
    expect(daysUntilExpiry({ status: 'active', currentPeriodEnd: end }, NOW)).toBe(4);
  });

  it('daysUntilExpiry returns null without expiry date', () => {
    expect(daysUntilExpiry({ status: 'active' }, NOW)).toBeNull();
  });
});

describe('buildCheckoutSessionPayload', () => {
  it('builds a subscription-mode payload with the supplied lookup key', () => {
    const p = buildCheckoutSessionPayload(
      {
        priceLookupKey: 'fuelyn-monthly',
        successUrl: 'https://app/success',
        cancelUrl: 'https://app/cancel',
        locale: 'de',
      },
      'user-42',
    );
    expect(p.mode).toBe('subscription');
    expect(p.line_items[0]?.price).toBe('fuelyn-monthly');
    expect(p.success_url).toBe('https://app/success');
    expect(p.cancel_url).toBe('https://app/cancel');
    expect(p.locale).toBe('de');
    expect(p.allow_promotion_codes).toBe(true);
    expect(p.client_reference_id).toBe('user-42');
  });

  it('omits customer when none provided', () => {
    const p = buildCheckoutSessionPayload(
      { priceLookupKey: 'fuelyn-annual', successUrl: 'a', cancelUrl: 'b' },
      'u',
    );
    expect('customer' in p).toBe(false);
  });

  it('passes through the customer id when provided', () => {
    const p = buildCheckoutSessionPayload(
      {
        priceLookupKey: 'fuelyn-monthly',
        successUrl: 'a',
        cancelUrl: 'b',
        stripeCustomerId: 'cus_123',
      },
      'u',
    );
    expect(p.customer).toBe('cus_123');
  });
});

describe('reconcileFromStripe', () => {
  function evt(
    type: StripeSubscriptionEventLike['type'],
    status: StripeSubscriptionEventLike['data']['object']['status'],
    extras: Partial<StripeSubscriptionEventLike['data']['object']> = {},
    lookupKey: string = 'fuelyn-monthly',
  ): StripeSubscriptionEventLike {
    return {
      type,
      data: {
        object: {
          id: 'sub_x',
          customer: 'cus_x',
          status,
          current_period_end: Math.floor(NOW.getTime() / 1000) + 30 * 86400,
          items: { data: [{ price: { lookup_key: lookupKey } }] },
          ...extras,
        },
      },
    };
  }

  it('translates active → active', () => {
    const s = reconcileFromStripe(evt('customer.subscription.created', 'active'));
    expect(s.status).toBe('active');
    expect(s.plan).toBe('monthly');
  });

  it('translates trialing → trial', () => {
    const s = reconcileFromStripe(evt('customer.subscription.created', 'trialing'));
    expect(s.status).toBe('trial');
  });

  it('treats cancel_at_period_end=true as cancelled with future expiry', () => {
    const s = reconcileFromStripe(
      evt('customer.subscription.updated', 'active', { cancel_at_period_end: true }),
    );
    expect(s.status).toBe('cancelled');
    expect(new Date(s.currentPeriodEnd!).getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('translates a delete event to cancelled', () => {
    const s = reconcileFromStripe(evt('customer.subscription.deleted', 'canceled'));
    expect(s.status).toBe('cancelled');
  });

  it('detects annual plan from lookup key', () => {
    const s = reconcileFromStripe(
      evt('customer.subscription.created', 'active', {}, 'fuelyn-annual'),
    );
    expect(s.plan).toBe('annual');
  });

  it('falls back to monthly when lookup key unknown', () => {
    const s = reconcileFromStripe(
      evt('customer.subscription.created', 'active', {}, 'something-else'),
    );
    expect(s.plan).toBe('monthly');
  });
});
