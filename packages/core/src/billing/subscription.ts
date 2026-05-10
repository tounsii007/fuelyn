// ============================================================
// Subscription / Premium Entitlement Engine
//
// Single source of truth for "is feature X unlocked for this user
// right now?". Used by gate UI ("Upgrade to Premium" overlay), by
// the BFF before serving paid endpoints, and by the Stripe webhook
// handler when activating a fresh subscription.
//
// Pure / deterministic. No I/O, no clock dependence except for an
// optional `now` argument used for trial-expiry checks. The actual
// Stripe API calls live in the BFF (apps/web/src/app/api/billing/*)
// because they need server-side secrets that must not ship to the
// client bundle.
// ============================================================

// -----------------------------------------------------------------
// Vocabulary
// -----------------------------------------------------------------

export type SubscriptionStatus =
  | 'free'         // never subscribed (or fully expired)
  | 'trial'        // 14-day no-charge evaluation
  | 'active'       // paid + current
  | 'past_due'     // failed payment, grace period
  | 'cancelled';   // user cancelled, ride out the period

/** Stable codes referenced from UI gating + BFF authz checks. */
export type PremiumFeature =
  | 'ai-chat-pro'           // unlimited AI chat (free tier capped at 5/day)
  | 'price-prediction-7d'   // 7-day forecast vs 24h on free
  | 'multi-vehicle-fleet'   // > 2 vehicles
  | 'wallet-pass'           // signed Apple/Google passes
  | 'voice-pro'             // hands-free continuous voice
  | 'border-crossing-live'  // live foreign-station prices (vs static estimate)
  | 'carbon-offset-buy'     // marketplace checkout
  | 'csv-export'            // unlimited bank/fuel-log CSV exports
  | 'wrapped-pdf'           // year-in-review PDF download
  | 'api-access';           // personal API key

export interface Subscription {
  status: SubscriptionStatus;
  /** ISO timestamp when the current period ends (renewal or cancellation date). */
  currentPeriodEnd?: string;
  /** Plan id ("monthly" / "annual" / null when free). */
  plan?: 'monthly' | 'annual' | 'lifetime' | null;
  /** Stripe subscription id when known. */
  stripeSubscriptionId?: string;
  /** Stripe customer id when known. */
  stripeCustomerId?: string;
}

// -----------------------------------------------------------------
// Defaults & feature matrix
// -----------------------------------------------------------------

export const FREE_SUBSCRIPTION: Subscription = { status: 'free', plan: null };

/**
 * Gating matrix — every feature is either always-free or premium-only.
 * Trial users get full premium access; past_due users keep access until
 * the grace period closes; cancelled users keep access until period end.
 */
export const FEATURE_TIER: Readonly<Record<PremiumFeature, 'free' | 'premium'>> = {
  'ai-chat-pro':          'premium',
  'price-prediction-7d':  'premium',
  'multi-vehicle-fleet':  'premium',
  'wallet-pass':          'premium',
  'voice-pro':            'premium',
  'border-crossing-live': 'premium',
  'carbon-offset-buy':    'premium',
  'csv-export':           'premium',
  'wrapped-pdf':          'premium',
  'api-access':           'premium',
};

// -----------------------------------------------------------------
// Engine
// -----------------------------------------------------------------

/**
 * Returns true iff the subscription currently grants access to `feature`.
 * Mainline rules:
 *   * free-tier features are always granted
 *   * trial / active grants ALL premium features
 *   * cancelled / past_due grant premium ONLY until currentPeriodEnd
 */
export function isFeatureUnlocked(
  feature: PremiumFeature,
  sub: Subscription | null | undefined,
  now: Date = new Date(),
): boolean {
  if (FEATURE_TIER[feature] === 'free') return true;
  if (!sub) return false;

  switch (sub.status) {
    case 'free':
      return false;
    case 'active':
    case 'trial':
      return true;
    case 'past_due':
    case 'cancelled':
      // Honor the paid period — when the user has cancelled,
      // they keep access until the period actually ends.
      if (!sub.currentPeriodEnd) return false;
      return new Date(sub.currentPeriodEnd).getTime() > now.getTime();
    default:
      return false;
  }
}

/**
 * Returns true iff the subscription is in a state where it should be
 * presented as "Premium" in the UI (active, trial, or in the cancelled-
 * but-not-yet-expired grace window).
 */
export function isPremium(sub: Subscription | null | undefined, now: Date = new Date()): boolean {
  if (!sub) return false;
  if (sub.status === 'active' || sub.status === 'trial') return true;
  if ((sub.status === 'past_due' || sub.status === 'cancelled') && sub.currentPeriodEnd) {
    return new Date(sub.currentPeriodEnd).getTime() > now.getTime();
  }
  return false;
}

/** Days remaining until currentPeriodEnd. Negative means already expired. */
export function daysUntilExpiry(
  sub: Subscription | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!sub?.currentPeriodEnd) return null;
  const ms = new Date(sub.currentPeriodEnd).getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

// -----------------------------------------------------------------
// Stripe payload builders (pure)
// -----------------------------------------------------------------

export interface CheckoutSessionRequest {
  /** Lookup key into the merchant's Stripe price catalogue. */
  priceLookupKey: 'fuelyn-monthly' | 'fuelyn-annual';
  /** Where Stripe redirects on completion. */
  successUrl: string;
  /** Where Stripe redirects on cancellation. */
  cancelUrl: string;
  /** Stable customer id when known (lets Stripe re-use the saved card). */
  stripeCustomerId?: string;
  /** Locale for the checkout UI. */
  locale?: string;
}

export interface CheckoutSessionPayload {
  mode: 'subscription';
  payment_method_types: ['card'];
  line_items: Array<{ price: string; quantity: 1 }>;
  success_url: string;
  cancel_url: string;
  customer?: string;
  locale?: string;
  allow_promotion_codes: true;
  client_reference_id: string;
}

/**
 * Builds the request body that the BFF will POST to
 * https://api.stripe.com/v1/checkout/sessions. Pure — no fetch.
 */
export function buildCheckoutSessionPayload(
  req: CheckoutSessionRequest,
  clientReferenceId: string,
): CheckoutSessionPayload {
  return {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: req.priceLookupKey, quantity: 1 }],
    success_url: req.successUrl,
    cancel_url: req.cancelUrl,
    ...(req.stripeCustomerId ? { customer: req.stripeCustomerId } : {}),
    ...(req.locale ? { locale: req.locale } : {}),
    allow_promotion_codes: true,
    client_reference_id: clientReferenceId,
  };
}

// -----------------------------------------------------------------
// Webhook reconciliation (pure)
// -----------------------------------------------------------------

export interface StripeSubscriptionEventLike {
  type:
    | 'customer.subscription.created'
    | 'customer.subscription.updated'
    | 'customer.subscription.deleted';
  data: {
    object: {
      id: string;
      customer: string;
      status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'unpaid';
      current_period_end: number; // Unix seconds
      cancel_at_period_end?: boolean;
      items: { data: Array<{ price: { lookup_key?: string } }> };
    };
  };
}

/**
 * Translate a Stripe webhook event into our local Subscription shape.
 * Used by the BFF webhook handler before persisting back to whichever
 * store the user data lives in.
 */
export function reconcileFromStripe(ev: StripeSubscriptionEventLike): Subscription {
  const obj = ev.data.object;
  const isAnnual = obj.items.data[0]?.price.lookup_key === 'fuelyn-annual';
  const periodEnd = new Date(obj.current_period_end * 1000).toISOString();

  const status: SubscriptionStatus = (() => {
    if (ev.type === 'customer.subscription.deleted') return 'cancelled';
    if (obj.status === 'trialing') return 'trial';
    if (obj.status === 'active') {
      return obj.cancel_at_period_end ? 'cancelled' : 'active';
    }
    if (obj.status === 'past_due') return 'past_due';
    if (obj.status === 'canceled') return 'cancelled';
    return 'free';
  })();

  return {
    status,
    plan: isAnnual ? 'annual' : 'monthly',
    currentPeriodEnd: periodEnd,
    stripeSubscriptionId: obj.id,
    stripeCustomerId: obj.customer,
  };
}
