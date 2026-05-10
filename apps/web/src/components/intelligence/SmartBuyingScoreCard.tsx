// ============================================================
// SmartBuyingScoreCard — single-KPI summary of fuel-buying skill.
//
// Mounted on the homepage sidebar (or in /stats as a deeper
// view). Shows the 0–100 score, a color-coded band label, the
// three component bars, and the "X € saved vs. market" line.
//
// Reads fuel log + price history from Zustand and computes the
// score client-side via core's computeSmartBuyingScore. Pure
// derived state — no network call.
// ============================================================

'use client';

import { useMemo } from 'react';
import { computeSmartBuyingScore, type SmartBuyingScore } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';

const BAND_COLOR: Record<SmartBuyingScore['band'], string> = {
  excellent: 'from-emerald-500 to-emerald-700',
  great: 'from-emerald-400 to-emerald-600',
  good: 'from-lime-500 to-emerald-500',
  average: 'from-amber-400 to-amber-600',
  'below-average': 'from-orange-500 to-rose-500',
  poor: 'from-rose-500 to-rose-700',
};

export function SmartBuyingScoreCard({ className = '' }: { className?: string }) {
  const { t, locale } = useTranslations();
  const hydrated = useIsHydrated();
  const fuelLog = useAppStore((s) => s.fuelLog);
  const market = useAppStore((s) => s.priceHistory);

  const result = useMemo(
    () => computeSmartBuyingScore({ log: fuelLog, market }),
    [fuelLog, market],
  );

  if (!hydrated) return null;
  if (result.evaluatedFills === 0) return null;

  const moneyFmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

  return (
    <article
      aria-label={t('smartBuying.title')}
      className={`mx-4 mt-3 mb-4 overflow-hidden rounded-2xl
                  border border-[var(--color-border-subtle)]
                  bg-[var(--color-surface)]/85 backdrop-blur-md
                  shadow-[var(--shadow-sm)] px-4 py-3 ${className}`}
    >
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          {t('smartBuying.title')}
        </h3>
        <span className="text-[10px] text-[var(--color-fg-subtle)]">
          {result.evaluatedFills} {t('smartBuying.fillsLabel')}
        </span>
      </header>

      {/* Score circle + band */}
      <div className="flex items-center gap-4 mb-3">
        <div
          className={`relative w-16 h-16 rounded-full grid place-items-center
                      bg-gradient-to-br ${BAND_COLOR[result.band]}
                      text-white shadow-[var(--shadow-sm)]`}
        >
          <span className="text-2xl font-extrabold tabular-nums leading-none">
            {result.score}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold text-[var(--color-fg)] capitalize leading-tight">
            {t(`smartBuying.band.${result.band}`)}
          </p>
          {result.totalEdgeEur !== 0 && (
            <p className="text-xs text-[var(--color-fg-subtle)] mt-0.5">
              {result.totalEdgeEur > 0
                ? t('smartBuying.savedTotal').replace('{amount}', moneyFmt(result.totalEdgeEur))
                : t('smartBuying.overpaidTotal').replace('{amount}', moneyFmt(Math.abs(result.totalEdgeEur)))}
            </p>
          )}
        </div>
      </div>

      {/* Component bars */}
      <dl className="space-y-1.5">
        <ComponentBar
          label={t('smartBuying.compPriceVsMarket')}
          value={result.components.priceVsMarket}
          range={[-1, 1]}
        />
        <ComponentBar
          label={t('smartBuying.compConsistency')}
          value={result.components.consistency}
          range={[0, 1]}
        />
        <ComponentBar
          label={t('smartBuying.compSpreadCapture')}
          value={result.components.spreadCapture}
          range={[0, 1]}
        />
      </dl>

      {result.confidence < 0.5 && (
        <p className="mt-2 text-[10px] text-[var(--color-fg-subtle)] text-center italic">
          {t('smartBuying.lowConfidenceHint')}
        </p>
      )}
    </article>
  );
}

function ComponentBar({
  label,
  value,
  range,
}: {
  label: string;
  value: number;
  range: [number, number];
}) {
  const [min, max] = range;
  const t = (value - min) / (max - min);
  const widthPct = Math.max(0, Math.min(100, t * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-0.5">
        <dt className="text-[var(--color-fg-subtle)]">{label}</dt>
        <dd className="font-semibold text-[var(--color-fg)] tabular-nums">
          {min === -1 && value < 0 ? '−' : ''}
          {Math.round(Math.abs(value) * 100)}%
        </dd>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 dark:from-emerald-400 dark:to-emerald-200"
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}
