// ============================================================
// Premium feature flags — Phase D (skeleton).
//
// Each feature is a string ID. The check is:
//   1. If running anonymously → only `free` features available.
//   2. If logged-in but not premium → `free` features + the
//      time-limited preview list.
//   3. If premium AND premiumUntil > now → all features.
//
// This module is intentionally pure — no React, no fetch, no
// store. It accepts a `PremiumStatus` snapshot and tells the
// caller what's allowed. The store / BFF wires the snapshot in.
//
// Server-side (gateway): the same enum lives in Java. Both sides
// must agree, otherwise a feature gate flips at the wrong layer
// and produces a confusing error UI. Keep them in lockstep when
// adding flags.
// ============================================================

export type FeatureId =
  | 'unlimited-route-stops'
  | 'ai-forecast-7d'
  | 'price-alert-push'
  | 'cross-device-sync'
  | 'co2-calculator'
  | 'wrap-export'
  | 'remove-ads';

/** Free-tier baseline features. Always available. */
const FREE_FEATURES = new Set<FeatureId>([
  // Cross-device-sync is a free feature for now — losing favourites
  // when switching from phone to desktop kills retention.
  'cross-device-sync',
]);

/**
 * Features available during the 14-day preview window after first
 * sign-up. Drives conversion: users see what they'd unlock with Pro.
 */
const TRIAL_FEATURES = new Set<FeatureId>([
  'ai-forecast-7d',
  'price-alert-push',
]);

const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

export interface PremiumStatus {
  authenticated: boolean;
  isPremium: boolean;
  /** Premium subscription valid until this Unix-ms. Null = not Pro. */
  premiumUntil: number | null;
  /** Account creation time (ms) — used for trial-window calculation. */
  createdAt: number | null;
}

export const ANONYMOUS: PremiumStatus = {
  authenticated: false,
  isPremium: false,
  premiumUntil: null,
  createdAt: null,
};

export function isFeatureEnabled(status: PremiumStatus, feature: FeatureId): boolean {
  if (FREE_FEATURES.has(feature)) return true;

  // Premium and still inside the paid window?
  if (status.isPremium && status.premiumUntil && status.premiumUntil > Date.now()) {
    return true;
  }

  // Trial window — only for explicitly trial-enabled features.
  if (status.authenticated && status.createdAt && TRIAL_FEATURES.has(feature)) {
    return Date.now() - status.createdAt < TRIAL_DURATION_MS;
  }

  return false;
}

export function premiumDaysRemaining(status: PremiumStatus): number | null {
  if (!status.isPremium || !status.premiumUntil) return null;
  const ms = status.premiumUntil - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function trialDaysRemaining(status: PremiumStatus): number | null {
  if (!status.authenticated || !status.createdAt) return null;
  const ms = TRIAL_DURATION_MS - (Date.now() - status.createdAt);
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
