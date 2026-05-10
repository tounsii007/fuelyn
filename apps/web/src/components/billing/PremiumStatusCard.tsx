// ============================================================
// PremiumStatusCard — settings-page panel for the subscription.
//
// Shows current plan + status, "Upgrade" CTAs for free users,
// and a "Manage subscription" link for premium users that opens
// the Stripe Billing Portal (or the dev-mode stub).
// ============================================================

'use client';

import { useCallback, useState } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useToast } from '@/components/ui/Toast';
import { isPremium, daysUntilExpiry } from '@fuelyn/core';

export function PremiumStatusCard() {
  const { t, locale } = useTranslations();
  const toast = useToast();
  const sub = useAppStore((s) => s.subscription);
  const setSub = useAppStore((s) => s.setSubscription);
  const [busy, setBusy] = useState(false);

  const premium = isPremium(sub);
  const days = daysUntilExpiry(sub);

  const openPortal = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show({
          tone: 'danger',
          title: t('premium.errorTitle'),
          description: data?.detail ?? data?.error ?? `HTTP ${res.status}`,
        });
        return;
      }
      if (data?.url) window.location.href = data.url;
    } finally {
      setBusy(false);
    }
  }, [t, toast]);

  const startCheckout = useCallback(
    async (priceLookupKey: 'fuelyn-monthly' | 'fuelyn-annual') => {
      setBusy(true);
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const res = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            priceLookupKey,
            successUrl: `${origin}/settings?checkout=ok`,
            cancelUrl: `${origin}/settings?checkout=cancel`,
            clientReferenceId: 'local-user',
            locale,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.show({
            tone: 'danger',
            title: t('premium.errorTitle'),
            description: data?.detail ?? data?.error ?? `HTTP ${res.status}`,
          });
          return;
        }
        if (data?.stub) {
          // Dev-mode short-circuit: flip the local subscription to
          // active so the UI flows can be exercised without Stripe.
          setSub({ status: 'active', plan: priceLookupKey === 'fuelyn-annual' ? 'annual' : 'monthly' });
          toast.show({ tone: 'success', title: t('premium.stubTitle'), description: t('premium.stubDesc') });
          return;
        }
        if (data?.url) window.location.href = data.url;
      } finally {
        setBusy(false);
      }
    },
    [locale, t, toast, setSub],
  );

  return (
    <section
      id="premium"
      aria-labelledby="premium-status-title"
      className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg)] p-5 space-y-3"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)] font-semibold">
            {t('premium.eyebrow')}
          </p>
          <h2 id="premium-status-title" className="text-base font-semibold text-[var(--color-fg)]">
            {premium ? t('premium.statusActive') : t('premium.statusFree')}
          </h2>
          {premium && days != null && (
            <p className="text-xs text-[var(--color-fg-subtle)]">
              {sub.plan ? `${sub.plan} · ` : ''}
              {t('premium.daysRemaining').replace('{days}', String(Math.max(0, days)))}
            </p>
          )}
        </div>
        {premium && (
          <span className="inline-flex items-center rounded-full bg-[var(--color-brand-500)]/10 text-[var(--color-brand-600)]
                          px-2 py-0.5 text-[11px] font-medium">
            {t('premium.activeBadge')}
          </span>
        )}
      </div>

      {premium && (
        <button
          type="button"
          onClick={openPortal}
          disabled={busy}
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5
                     text-sm font-medium hover:bg-[var(--color-surface-hover)]
                     disabled:opacity-50 transition-colors"
        >
          {t('premium.managePortalCta')}
        </button>
      )}

      {!premium && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => startCheckout('fuelyn-monthly')}
            disabled={busy}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5
                       hover:bg-[var(--color-surface-hover)] disabled:opacity-50 transition-colors text-left"
          >
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)]">
              {t('premium.monthlyLabel')}
            </p>
            <p className="text-sm font-semibold text-[var(--color-fg)]">3,99 €/Monat</p>
          </button>
          <button
            type="button"
            onClick={() => startCheckout('fuelyn-annual')}
            disabled={busy}
            className="rounded-xl border-2 border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/5 px-3 py-2.5
                       hover:bg-[var(--color-brand-500)]/10 disabled:opacity-50 transition-colors text-left"
          >
            <p className="text-[10px] uppercase tracking-wide text-[var(--color-brand-600)]">
              {t('premium.annualLabel')}
            </p>
            <p className="text-sm font-semibold text-[var(--color-fg)]">29,99 €/Jahr</p>
            <p className="text-[10px] text-[var(--color-success-600)]">{t('premium.annualSavingsBadge')}</p>
          </button>
        </div>
      )}

      <p className="text-[11px] text-[var(--color-fg-subtle)]">
        {t('premium.feeDisclaimer')}
      </p>
    </section>
  );
}
