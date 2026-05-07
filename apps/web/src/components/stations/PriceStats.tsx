// ============================================================
// PriceStats — Price statistics bar (min/avg/max)
// Shows a compact overview of prices across all found stations.
// ============================================================

'use client';

import { useMemo } from 'react';
import type { StationRecommendation } from '@tankpilot/core';
import { formatPrice, FUEL_TYPE_LABELS } from '@tankpilot/core';
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
    <div className="mx-4 mb-3 bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">
          {FUEL_TYPE_LABELS[fuelType]} Preise
        </p>
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          {stats.count} Stationen mit Preis
        </p>
      </div>

      {/* Stats Row */}
      <div className="flex items-end justify-between gap-2 mb-3">
        <div className="text-center">
          <p className="text-[10px] text-reach-safe font-medium">G&uuml;nstigste</p>
          <p className="text-base font-bold text-reach-safe">{formatPrice(stats.min)} &euro;</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">Durchschnitt</p>
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">{formatPrice(stats.avg)} &euro;</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-reach-unreachable font-medium">Teuerste</p>
          <p className="text-base font-bold text-reach-unreachable">{formatPrice(stats.max)} &euro;</p>
        </div>
      </div>

      {/* Visual Price Bar */}
      <div className="relative h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-visible">
        {/* Gradient bar */}
        <div className="absolute inset-0 rounded-full"
          style={{
            background: 'linear-gradient(to right, #10B981, #F59E0B, #EF4444)',
          }}
        />
        {/* Average indicator */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white dark:bg-gray-200 border-2 border-gray-900 dark:border-gray-300 rounded-full shadow-sm"
          style={{ left: `${avgPosition}%`, marginLeft: -6 }}
          title={`Durchschnitt: ${formatPrice(stats.avg)} \u20AC`}
        />
      </div>

      {/* Savings hint */}
      {stats.spread > 0.02 && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-center">
          Sparpotenzial: bis zu {formatPrice(stats.spread)} &euro;/L
          {stats.spread > 0.05 && ' \u2014 Vergleichen lohnt sich!'}
        </p>
      )}
    </div>
  );
}
