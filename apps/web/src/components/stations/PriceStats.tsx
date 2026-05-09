// ============================================================
// PriceStats — Price statistics bar (min/avg/max)
// Shows a compact overview of prices across all found stations.
// ============================================================

'use client';

import { useMemo } from 'react';
import type { StationRecommendation } from '@fuelyn/core';
import { formatPrice, FUEL_TYPE_LABELS } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

interface PriceStatsProps {
  recommendations: StationRecommendation[];
}

export function PriceStats({ recommendations }: PriceStatsProps) {
  const fuelType = useAppStore((s) => s.filter.fuelType);

  const stats = useMemo(() => {
    const prices = recommendations
      .map((r) => r.station.prices?.[fuelType])
      .filter((p): p is number => p != null && p > 0);

    if (prices.length === 0) return null;

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const spread = max - min;

    return { min, max, avg, spread, count: prices.length };
  }, [recommendations, fuelType]);

  if (!stats) return null;

  // Position of average on the bar (0-100%)
  const avgPosition = stats.spread > 0
    ? ((stats.avg - stats.min) / stats.spread) * 100
    : 50;

  return (
    <section
      aria-label={`${FUEL_TYPE_LABELS[fuelType]} Preisübersicht`}
      className="mx-3 mb-2 bg-white dark:bg-gray-800/90 rounded-2xl shadow-card
                 border border-gray-100 dark:border-gray-700/60 px-3 py-2.5"
    >
      <header className="flex items-center justify-between mb-1.5">
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          {FUEL_TYPE_LABELS[fuelType]} Preise
        </p>
        <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
          {stats.count} Stationen mit Preis
        </p>
      </header>

      {/* Stats Row */}
      <dl className="flex items-end justify-between gap-2 mb-2">
        <div className="text-center">
          <dt className="text-[10px] font-medium text-reach-safe">Günstigste</dt>
          <dd className="text-base font-bold text-reach-safe tabular-nums">
            {formatPrice(stats.min)} €
          </dd>
        </div>
        <div className="text-center">
          <dt className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
            Durchschnitt
          </dt>
          <dd className="text-sm font-semibold tabular-nums text-gray-700 dark:text-gray-200">
            {formatPrice(stats.avg)} €
          </dd>
        </div>
        <div className="text-center">
          <dt className="text-[10px] font-medium text-reach-unreachable">Teuerste</dt>
          <dd className="text-base font-bold text-reach-unreachable tabular-nums">
            {formatPrice(stats.max)} €
          </dd>
        </div>
      </dl>

      {/* Visual Price Bar — pure-Tailwind gradient via fuel/reach colors */}
      <div
        className="relative h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-visible"
        role="img"
        aria-label={`Preisverteilung: günstig ${formatPrice(stats.min)} €, teuer ${formatPrice(stats.max)} €`}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-reach-safe via-reach-tight to-reach-unreachable" />
        {/* Average indicator */}
        <span
          className="absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3 h-3
                     bg-white dark:bg-gray-100 border-2 border-gray-900 dark:border-gray-300
                     rounded-full shadow-sm"
          style={{ left: `${avgPosition}%` }}
          title={`Durchschnitt: ${formatPrice(stats.avg)} €`}
          aria-hidden="true"
        />
      </div>

      {/* Savings callout — promoted to a tonal banner when the spread is
          big enough to actually matter per refuel (>5 ct/L ≈ 2.50 €
          on a 50 L tank). Below that, keep it as muted micro-text so the
          panel doesn't feel noisy. */}
      {stats.spread > 0.05 ? (
        <div
          className="mt-2 flex items-center gap-2 rounded-xl border border-emerald-200/60
                     bg-emerald-50 px-2.5 py-1.5
                     dark:border-emerald-700/40 dark:bg-emerald-900/20"
        >
          <svg
            className="h-3.5 w-3.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="text-[10px] leading-tight text-emerald-800 dark:text-emerald-200">
            Bis zu{' '}
            <span className="font-bold tabular-nums">
              {(stats.spread * 50).toFixed(2)} €
            </span>{' '}
            sparen pro 50 L Tank — Vergleichen lohnt sich.
          </p>
        </div>
      ) : stats.spread > 0.02 ? (
        <p className="mt-2 text-center text-[10px] text-gray-500 dark:text-gray-400">
          Sparpotenzial: bis zu {formatPrice(stats.spread)} €/L
        </p>
      ) : null}
    </section>
  );
}
