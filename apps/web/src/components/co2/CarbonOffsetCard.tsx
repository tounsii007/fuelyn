// ============================================================
// CarbonOffsetCard — turn the user's CO₂ footprint into a one-tap
// offset purchase. Lives next to the existing CO₂ dashboard.
//
// Free users see the catalogue + "what would it cost" preview.
// Premium users (carbon-offset-buy feature) see the active
// purchase links to each provider's checkout. The actual payment
// happens on the provider site — we don't take a cut.
// ============================================================

'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import {
  recommendOffsets,
  summarizeCo2,
  isFeatureUnlocked,
  withAffiliate,
  parseAffiliateEnv,
} from '@fuelyn/core';

// Read at module scope so the affiliate config is computed once.
// In production, env vars come pre-baked at build time (Next.js
// inlines NEXT_PUBLIC_* / serves the rest server-side via the BFF).
// For now we fall back to no codes — production deploy sets them.
const AFFILIATE_CONFIG = parseAffiliateEnv(
  typeof process !== 'undefined' && process.env
    ? (process.env as Record<string, string | undefined>)
    : {},
);

const PROJECT_LABELS: Record<string, string> = {
  'reforestation':       'Aufforstung',
  'forestry-protection': 'Waldschutz',
  'biogas':              'Biogas',
  'cookstoves':          'Effiziente Kochherde',
  'wind-solar':          'Wind & Solar',
  'direct-air-capture':  'Direct Air Capture',
};

const CERT_LABELS: Record<string, string> = {
  'gold-standard': 'Gold Standard',
  'vcs':           'VCS',
  'cdm':           'CDM',
  'ccb':           'CCB',
  'puro':          'Puro',
};

export function CarbonOffsetCard() {
  const hydrated = useIsHydrated();
  const { t } = useTranslations();
  const fuelLog = useAppStore((s) => s.fuelLog);
  const subscription = useAppStore((s) => s.subscription);
  const canBuy = isFeatureUnlocked('carbon-offset-buy', subscription);

  // We always offset on the lifetime CO₂ rather than the rolling
  // 30-day window — users want to see "what does it cost to clean up
  // EVERYTHING I burned with this app" not just last month.
  const co2Result = useMemo(() => {
    if (fuelLog.length === 0) return null;
    return summarizeCo2(fuelLog);
  }, [fuelLog]);

  const offsetResult = useMemo(() => {
    if (!co2Result || co2Result.totalCo2Kg <= 0) return null;
    return recommendOffsets(co2Result.totalCo2Kg);
  }, [co2Result]);

  if (!hydrated || !offsetResult || !co2Result) return null;

  const tons = co2Result.totalCo2Kg / 1000;

  return (
    <section
      aria-labelledby="offset-title"
      className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg)] p-5 space-y-4"
    >
      <div>
        <p className="text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)] font-semibold">
          {t('offset.eyebrow')}
        </p>
        <h3 id="offset-title" className="text-base font-semibold text-[var(--color-fg)]">
          {t('offset.title')}
        </h3>
        <p className="text-sm text-[var(--color-fg-subtle)]">
          {t('offset.subtitle')
            .replace('{tons}', tons.toFixed(2))
            .replace('{kg}', co2Result.totalCo2Kg.toFixed(0))}
        </p>
      </div>

      {/* Headline picks */}
      <div className="grid grid-cols-2 gap-3">
        <Pick
          label={t('offset.cheapestLabel')}
          provider={offsetResult.cheapest.provider.name}
          totalEur={offsetResult.cheapest.totalEur}
          ratePerTon={offsetResult.cheapest.provider.eurPerTon}
          canBuy={canBuy}
          url={withAffiliate(offsetResult.cheapest.provider.url, offsetResult.cheapest.provider.id, AFFILIATE_CONFIG)}
          desc={PROJECT_LABELS[offsetResult.cheapest.provider.projectType] ?? ''}
        />
        <Pick
          label={t('offset.permanenceLabel')}
          provider={offsetResult.highestPermanence.provider.name}
          totalEur={offsetResult.highestPermanence.totalEur}
          ratePerTon={offsetResult.highestPermanence.provider.eurPerTon}
          canBuy={canBuy}
          url={withAffiliate(offsetResult.highestPermanence.provider.url, offsetResult.highestPermanence.provider.id, AFFILIATE_CONFIG)}
          desc={PROJECT_LABELS[offsetResult.highestPermanence.provider.projectType] ?? ''}
          highlight
        />
      </div>

      {/* Full catalogue collapse */}
      <details className="group">
        <summary className="cursor-pointer list-none text-xs text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] inline-flex items-center gap-1">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="transition-transform group-open:rotate-90">
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {t('offset.showAll')}
        </summary>
        <ul className="mt-3 space-y-1.5">
          {offsetResult.all.map((opt) => (
            <li
              key={opt.provider.id}
              className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-[var(--color-bg-subtle)]"
            >
              <span className="min-w-0">
                <span className="block font-medium text-[var(--color-fg)] truncate">
                  {opt.provider.name}
                  <span className="ml-1.5 text-[10px] text-[var(--color-fg-subtle)]">
                    · {CERT_LABELS[opt.provider.certification] ?? opt.provider.certification}
                  </span>
                </span>
                <span className="block text-[10px] text-[var(--color-fg-subtle)]">
                  {opt.provider.descDe}
                </span>
              </span>
              <span className="ml-2 font-mono tabular-nums text-[var(--color-fg)]">
                {opt.totalEur.toFixed(2)} €
              </span>
            </li>
          ))}
        </ul>
      </details>

      {!canBuy && (
        <p className="text-[10px] text-[var(--color-fg-subtle)] italic">
          {t('offset.premiumHint')}
        </p>
      )}
    </section>
  );
}

interface PickProps {
  label: string;
  provider: string;
  totalEur: number;
  ratePerTon: number;
  canBuy: boolean;
  url: string;
  desc: string;
  highlight?: boolean;
}

function Pick({ label, provider, totalEur, ratePerTon, canBuy, url, desc, highlight }: PickProps) {
  const { t } = useTranslations();
  const cls = highlight
    ? 'border-2 border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/5'
    : 'border border-[var(--color-border)] bg-[var(--color-bg)]';
  return (
    <div className={`rounded-xl ${cls} p-3`}>
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)]">{label}</p>
      <p className="text-sm font-semibold text-[var(--color-fg)] truncate">{provider}</p>
      <p className="text-[10px] text-[var(--color-fg-subtle)]">{desc}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-[var(--color-fg)]">
        {totalEur.toFixed(2)} €
      </p>
      <p className="text-[10px] text-[var(--color-fg-subtle)]">
        {ratePerTon} €/Tonne
      </p>
      <a
        href={canBuy ? url : '/settings#premium'}
        target={canBuy ? '_blank' : undefined}
        rel={canBuy ? 'noopener noreferrer' : undefined}
        className="mt-2 block text-center rounded-md bg-[var(--color-brand-500)] hover:bg-[var(--color-brand-600)] text-white text-xs font-medium py-1.5 transition-colors"
      >
        {canBuy ? t('offset.purchaseCta') : t('offset.unlockCta')}
      </a>
    </div>
  );
}
