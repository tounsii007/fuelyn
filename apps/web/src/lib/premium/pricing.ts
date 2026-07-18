// ============================================================
// Premium pricing — single source of truth.
//
// The DISPLAYED amounts here must match the Stripe price objects
// keyed `fuelyn-monthly` / `fuelyn-annual` (configured in the Stripe
// dashboard). Keeping them in one module means the card, the savings
// badge and any future pricing page stay in lockstep.
// ============================================================

import type { AppLocale } from '@fuelyn/core';

export const PREMIUM_PRICE = {
  monthlyEur: 1.99,
  annualEur: 19.99,
} as const;

// Annual savings vs 12× monthly, rounded to a whole percent. Derived
// so the badge can never drift from the actual prices.
export const PREMIUM_ANNUAL_SAVINGS_PCT = Math.round(
  (1 - PREMIUM_PRICE.annualEur / (PREMIUM_PRICE.monthlyEur * 12)) * 100,
);

// AppLocale → BCP-47 tag for Intl currency formatting. Note the
// German market is priced in EUR; only the *format* localises
// (e.g. de "1,99 €" vs en "€1.99").
const LOCALE_BCP47: Record<AppLocale, string> = {
  de: 'de-DE',
  en: 'en-GB',
  'en-US': 'en-US',
  fr: 'fr-FR',
};

/** Format an EUR amount for the given app locale, e.g. "1,99 €" / "€1.99". */
export function formatEur(amount: number, locale: AppLocale): string {
  try {
    return new Intl.NumberFormat(LOCALE_BCP47[locale] ?? 'de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  } catch {
    // Ultra-defensive fallback if Intl/locale data is unavailable.
    return `${amount.toFixed(2).replace('.', ',')} €`;
  }
}
