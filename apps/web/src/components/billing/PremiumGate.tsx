// ============================================================
// PremiumGate — wraps a feature in a "Premium only" prompt.
//
//   <PremiumGate feature="ai-chat-pro" fallback={<UpgradeBanner />}>
//     <UnlimitedChat />
//   </PremiumGate>
//
// When the user's subscription unlocks the feature, children render
// untouched. Otherwise the fallback (or a default upgrade banner)
// renders in their place. Use sparingly — it's better to design
// features with a free preview than to hide them entirely.
// ============================================================

'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { isFeatureUnlocked, type PremiumFeature } from '@fuelyn/core';

export interface PremiumGateProps {
  feature: PremiumFeature;
  children: ReactNode;
  /** Optional override for the locked-state UI. */
  fallback?: ReactNode;
}

export function PremiumGate({ feature, children, fallback }: PremiumGateProps) {
  const subscription = useAppStore((s) => s.subscription);
  const unlocked = useMemo(() => isFeatureUnlocked(feature, subscription), [feature, subscription]);

  if (unlocked) return <>{children}</>;
  return <>{fallback ?? <DefaultLockedBanner feature={feature} />}</>;
}

function DefaultLockedBanner({ feature }: { feature: PremiumFeature }) {
  const { t } = useTranslations();
  return (
    <div className="rounded-2xl border border-[var(--color-brand-500)]/40
                    bg-gradient-to-br from-[var(--color-brand-500)]/10 to-transparent
                    p-5 text-center space-y-2">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-brand-600)] dark:text-[var(--color-brand-400)] font-semibold">
        {t('premium.eyebrow')}
      </p>
      <h3 className="text-base font-semibold text-[var(--color-fg)]">
        {t(`premium.featureTitles.${feature}` as const)}
      </h3>
      <p className="text-sm text-[var(--color-fg-subtle)]">
        {t('premium.lockedDesc')}
      </p>
      <a
        href="/settings?source=premium-gate#premium"
        className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-brand-500)] text-white
                   px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-brand-600)] transition-colors"
      >
        {t('premium.upgradeCta')}
      </a>
    </div>
  );
}
