// ============================================================
// CounterfactualCard — "Was wäre wenn …" comparison stack.
//
// Renders the top counterfactual scenarios as comparison cards.
// Auto-suppresses if the user has no fuel log to evaluate.
// ============================================================

'use client';

import { useMemo } from 'react';
import { computeCounterfactuals, type ScenarioResult } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';

const SCENARIO_ICON: Record<ScenarioResult['id'], string> = {
  'switch-to-hybrid': '🔋',
  'switch-to-ev': '⚡',
  'switch-to-diesel': '🛢️',
  'switch-to-e10': '🌾',
  'fill-at-best-station': '🎯',
  'fill-before-8am': '☀️',
};

export function CounterfactualCard({ className = '' }: { className?: string }) {
  const { t, locale } = useTranslations();
  const hydrated = useIsHydrated();
  const fuelLog = useAppStore((s) => s.fuelLog);
  const market = useAppStore((s) => s.priceHistory);

  const result = useMemo(
    () => computeCounterfactuals({ log: fuelLog, market }),
    [fuelLog, market],
  );

  if (!hydrated || !result || fuelLog.length < 3) return null;

  const moneyFmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

  const dateFmt = (iso: string) =>
    new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(new Date(iso));

  // Show only positive-savings scenarios so we don't suggest
  // things that would cost MORE.
  const positiveScenarios = result.scenarios.filter((s) => s.deltaEur > 1);
  if (positiveScenarios.length === 0) return null;

  return (
    <article
      aria-label={t('counterfactual.title')}
      className={`mx-4 mt-3 mb-4 rounded-2xl
                  border border-[var(--color-border-subtle)]
                  bg-[var(--color-surface)]/85 backdrop-blur-md
                  shadow-[var(--shadow-sm)] px-4 py-3 ${className}`}
    >
      <header className="mb-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          {t('counterfactual.title')}
        </h3>
        <p className="text-[11px] text-[var(--color-fg-subtle)] mt-0.5">
          {t('counterfactual.subtitle')
            .replace('{start}', dateFmt(result.spanLabel.startIso))
            .replace('{end}', dateFmt(result.spanLabel.endIso))}
        </p>
      </header>

      <ul className="space-y-2">
        {positiveScenarios.slice(0, 4).map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl
                       bg-[var(--color-bg-subtle)]/60
                       border border-[var(--color-border)]"
          >
            <span className="text-xl flex-shrink-0" aria-hidden="true">
              {SCENARIO_ICON[s.id]}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--color-fg)] leading-snug">
                {t(`counterfactual.scenario.${s.id}.title`)}
              </p>
              <p className="text-[11px] text-[var(--color-fg-subtle)] leading-tight mt-0.5">
                {t(`counterfactual.scenario.${s.id}.desc`)}
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                −{moneyFmt(s.deltaEur)}
              </p>
              {s.deltaCo2Kg !== 0 && (
                <p className="text-[10px] text-[var(--color-fg-subtle)] tabular-nums">
                  −{Math.round(s.deltaCo2Kg)} kg CO₂
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}
