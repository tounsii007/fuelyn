// ============================================================
// SavingTipsCard — personalized "spar X € pro Jahr" suggestions.
//
// Reads fuel-log + price history, runs computeSavingTips, and
// renders the top 3 tips as a stack. Each tip body comes from
// an i18n template that substitutes the engine's `context` dict.
// ============================================================

'use client';

import { useMemo } from 'react';
import { computeSavingTips, type SavingTip } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';

const SEVERITY_TONE: Record<SavingTip['severity'], string> = {
  high: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/50 text-emerald-900 dark:text-emerald-100',
  medium: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-100',
  low: 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800/50 text-sky-900 dark:text-sky-100',
};

const SEVERITY_ICON: Record<SavingTip['severity'], string> = {
  high: '💡',
  medium: '✨',
  low: '🔍',
};

export function SavingTipsCard({ className = '' }: { className?: string }) {
  const { t, locale } = useTranslations();
  const hydrated = useIsHydrated();
  const fuelLog = useAppStore((s) => s.fuelLog);
  const market = useAppStore((s) => s.priceHistory);

  const result = useMemo(
    () => computeSavingTips({ log: fuelLog, market, maxTips: 3 }),
    [fuelLog, market],
  );

  if (!hydrated) return null;
  if (result.tips.length === 0) return null;

  const moneyFmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

  // Convert engine context to template variables. Days/hours
  // need locale-aware formatting (Mo, Mon, lun., etc.).
  const formatContext = (tip: SavingTip): Record<string, string | number> => {
    const ctx = { ...tip.context };
    if (typeof ctx.currentDay === 'number') {
      ctx.currentDay = formatDayLabel(ctx.currentDay as number, locale);
    }
    if (typeof ctx.betterDay === 'number') {
      ctx.betterDay = formatDayLabel(ctx.betterDay as number, locale);
    }
    if (typeof ctx.currentHour === 'number') {
      ctx.currentHour = `${String(ctx.currentHour).padStart(2, '0')}:00`;
    }
    if (typeof ctx.betterHour === 'number') {
      ctx.betterHour = `${String(ctx.betterHour).padStart(2, '0')}:00`;
    }
    return ctx;
  };

  return (
    <article
      aria-label={t('savingTips.title')}
      className={`mx-4 mt-3 mb-4 rounded-2xl
                  border border-[var(--color-border-subtle)]
                  bg-[var(--color-surface)]/85 backdrop-blur-md
                  shadow-[var(--shadow-sm)] px-4 py-3 ${className}`}
    >
      <header className="mb-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          {t('savingTips.title')}
        </h3>
        <p className="text-[11px] text-[var(--color-fg-subtle)] mt-0.5">
          {t('savingTips.subtitle')}
        </p>
      </header>

      <ul className="space-y-2">
        {result.tips.map((tip) => (
          <li key={tip.id} className={`rounded-xl p-3 border ${SEVERITY_TONE[tip.severity]}`}>
            <div className="flex items-start gap-2.5">
              <span className="text-base flex-shrink-0" aria-hidden="true">
                {SEVERITY_ICON[tip.severity]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug">
                  {applyTemplate(t(`savingTips.${tip.id}.title`), formatContext(tip))}
                </p>
                <p className="text-xs leading-snug mt-0.5 opacity-90">
                  {applyTemplate(t(`savingTips.${tip.id}.body`), formatContext(tip))}
                </p>
                {tip.estimatedSavingsEurPerYear > 1 && (
                  <p className="text-[10px] font-bold mt-1.5 tabular-nums">
                    ≈ {moneyFmt(tip.estimatedSavingsEurPerYear)} {t('savingTips.perYear')}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

function applyTemplate(template: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
    template,
  );
}

function formatDayLabel(dow: number, locale: string): string {
  // Anchor on a known Monday so dow=0 → Monday in the formatter
  const monday = new Date(Date.UTC(2026, 0, 5));
  const d = new Date(monday);
  d.setUTCDate(monday.getUTCDate() + dow);
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(d);
  } catch {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dow] ?? String(dow);
  }
}
