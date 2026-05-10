// ============================================================
// Telemetry — privacy-respecting event vocabulary + A/B framework
//
// Design rules (set in stone):
//   1. NEVER log payloads / values / parameters — only the
//      stable event NAME and an optional A/B variant token.
//   2. Day-resolution timestamps only (no second-precision; rounding
//      makes individual users harder to single out from a dump).
//   3. Per-user counts coalesced server-side via a unique constraint
//      on (userId, name, variant, day) — at most ONE row per user
//      per event per variant per day, regardless of how often the
//      user fires it.
//   4. Aggregate-friendly by construction. Anyone querying the
//      table sees event counts, never user trails.
//
// The A/B variant tokens are stable strings. Defining the variant
// surface here (vs in component code) keeps the inventory small
// and reviewable.
// ============================================================

export type TelemetryEventName =
  // First-run / activation funnel
  | 'app.first-open'
  | 'onboarding.completed'
  | 'demo-data.loaded'
  // Premium funnel
  | 'premium.viewed'
  | 'premium.checkout-started'
  | 'premium.checkout-succeeded'
  | 'premium.checkout-failed'
  | 'premium.portal-opened'
  | 'premium.feature-locked'  // user hit a PremiumGate
  // Engagement
  | 'voice.opened'
  | 'voice.intent.find-cheapest'
  | 'voice.intent.add-fuel-log'
  | 'voice.intent.unknown'
  | 'price-report.submitted'
  | 'price-report.photo-verified'
  | 'wallet-pass.requested'
  | 'border-crossing.shown'
  | 'fuel-log.entry-added'
  | 'fuel-log.entry-imported'
  // Multi-country
  | 'country-adapter.queried'  // generic, variant carries the code
  // Cold-start mitigation
  | 'demo-data.try-clicked';

/**
 * A/B variant tokens. Adding a new variant is a 1-line change here
 * + assign the variant in client code via assignVariant().
 */
export type ABTest =
  | 'pricing'        // monthly vs annual prominence
  | 'gate-copy'      // upgrade-cta wording
  | 'onboarding-cta'; // "Try with sample data" vs "Add first fill-up"

export interface TelemetryEvent {
  name: TelemetryEventName;
  variant?: string;
  /** Day-resolution timestamp (ISO yyyy-mm-dd). Caller fills, server rounds again as a guard. */
  day: string;
}

/** Build a stable yyyy-mm-dd from a Date. */
export function toDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------
// Stable, deterministic A/B variant assignment
// -----------------------------------------------------------------
//
// Hashes (userId|test) modulo the variant count. Same user always
// sees the same variant for a given test — no flickering between
// page loads.

const FNV_OFFSET = 0x811c9dc5 >>> 0;
const FNV_PRIME = 0x01000193 >>> 0;

function fnv1a(input: string): number {
  let h = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h;
}

export function assignVariant<T extends string>(
  userId: string,
  test: ABTest,
  variants: readonly T[],
): T {
  if (variants.length === 0) {
    throw new Error('assignVariant: variants[] must not be empty');
  }
  const idx = fnv1a(`${userId}|${test}`) % variants.length;
  return variants[idx]!;
}
