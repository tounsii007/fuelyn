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
  // When the user has a station open in the detail panel, surface
  // its position on the spread bar so they can SEE whether the
  // station they're considering is on the cheap or expensive end.
  const routeTarget = useAppStore((s) => s.routeTarget);

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
      className="mx-4 mb-3 bg-white dark:bg-gray-800/90 rounded-2xl shadow-card
                 border border-gray-100 dark:border-gray-700/60 p-4"
    >
      <header className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          {FUEL_TYPE_LABELS[fuelType]} Preise
        </p>
        <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
          {stats.count} Stationen mit Preis
        </p>
      </header>

      {/* Stats Row */}
      <dl className="flex items-end justify-between gap-2 mb-3">
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

      {/* Visual Price Bar — pure-Tailwind gradient via fuel/reach colors.
           Also marks the currently-open station's position when one
           is selected, so the user can read at a glance whether
           their choice is on the cheap or expensive end of the spread. */}
      <div
        className="relative h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-visible"
        role="img"
        aria-label={`Preisverteilung: günstig ${formatPrice(stats.min)} €, teuer ${formatPrice(stats.max)} €`}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-r from-reach-safe via-reach-tight to-reach-unreachable" />

        {/* Average indicator (white dot, neutral). */}
        <span
          className="absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3 h-3
                     bg-white dark:bg-gray-100 border-2 border-gray-900 dark:border-gray-300
                     rounded-full shadow-sm"
          style={{ left: `${avgPosition}%` }}
          title={`Durchschnitt: ${formatPrice(stats.avg)} €`}
          aria-hidden="true"
        />

        {/*
          Selected-station marker — only shown when the panel has
          a target whose price for this fuel falls inside the
          measured spread. Brand-blue triangle pointing UP at the
          bar so it's visually distinct from the round avg dot.
          Skipped when target == avg position (would just collide
          with the avg marker and add noise).
        */}
        {(() => {
          const targetPrice = routeTarget?.prices?.[fuelType];
          if (typeof targetPrice !== 'number') return null;
          if (targetPrice < stats.min - 0.0001 || targetPrice > stats.max + 0.0001) return null;
          const targetPosition = stats.spread > 0
            ? ((targetPrice - stats.min) / stats.spread) * 100
            : 50;
          if (Math.abs(targetPosition - avgPosition) < 1.5) return null;
          return (
            <span
              className="absolute top-1/2 -translate-y-1/2 -ml-2 -mt-3 flex flex-col items-center pointer-events-none"
              style={{ left: `${targetPosition}%` }}
              aria-hidden="true"
              title={`${routeTarget?.brand || routeTarget?.name || 'Diese Tankstelle'}: ${formatPrice(targetPrice)} €`}
            >
              <span className="text-[8px] font-bold text-brand-700 dark:text-brand-300 leading-none mb-0.5 whitespace-nowrap">
                hier
              </span>
              <span className="block w-0 h-0 border-l-4 border-r-4 border-t-[6px]
                               border-l-transparent border-r-transparent
                               border-t-brand-600 dark:border-t-brand-400" />
            </span>
          );
        })()}
      </div>

      {/* Savings hint */}
      {stats.spread > 0.02 && (
        <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-2 text-center">
          Sparpotenzial: bis zu {formatPrice(stats.spread)} €/L
          {stats.spread > 0.05 && ' — Vergleichen lohnt sich!'}
        </p>
      )}
    </section>
  );
}
