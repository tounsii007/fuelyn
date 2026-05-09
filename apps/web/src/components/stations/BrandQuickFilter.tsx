// ============================================================
// BrandQuickFilter — horizontal scrollable strip of brand chips
//
// Surfaces the top brands present in the current candidate set as
// one-tap filter pills. Tapping a chip toggles that brand in the
// shared filter.brands array — the same store slice the existing
// FilterPanel writes to, so the two stay in sync. Tapping a chip
// when nothing is selected ADDS it; tapping again REMOVES it.
//
// We deliberately surface only the top N brands by station count,
// so the row stays scannable even in cities with 30+ brands. The
// full multi-select stays available behind the SortBar's filter
// button for completeness.
// ============================================================

'use client';

import { useMemo } from 'react';
import type { StationRecommendation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

export interface BrandQuickFilterProps {
  readonly recommendations: readonly StationRecommendation[];
  /** Cap on chips rendered. Default 8 — beyond that the row
   *  starts to feel like a bag of brands instead of a quick
   *  pick. The full filter panel covers everything past this. */
  readonly maxBrands?: number;
}

export function BrandQuickFilter({ recommendations, maxBrands = 8 }: BrandQuickFilterProps) {
  const filter = useAppStore((s) => s.filter);
  const setFilter = useAppStore((s) => s.setFilter);

  // Top-N brands by station count in the current candidate set.
  // Recommended over a hardcoded list because it always reflects
  // what's actually findable here-and-now (no stale "Aral" chip
  // when there's no Aral in the visible radius).
  const topBrands = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of recommendations) {
      const b = r.station.brand?.trim();
      if (!b) continue;
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxBrands);
  }, [recommendations, maxBrands]);

  if (topBrands.length === 0) return null;

  const toggleBrand = (brand: string) => {
    const has = filter.brands.includes(brand);
    setFilter({
      brands: has ? filter.brands.filter((b) => b !== brand) : [...filter.brands, brand],
    });
  };

  return (
    <div
      className="flex items-center gap-1.5 px-4 pb-2 -mt-1 overflow-x-auto scrollbar-hide"
      role="group"
      aria-label="Marken-Schnellfilter"
    >
      <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mr-1">
        Marken
      </span>
      {topBrands.map(([brand, count]) => {
        const active = filter.brands.includes(brand);
        return (
          <button
            key={brand}
            type="button"
            onClick={() => toggleBrand(brand)}
            className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                        text-[11px] font-medium transition-all
                        ${
                          active
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
            title={
              active
                ? `Filter "${brand}" entfernen`
                : `Nur ${brand} anzeigen (${count} ${count === 1 ? 'Tankstelle' : 'Tankstellen'})`
            }
            aria-pressed={active}
          >
            <span>{brand}</span>
            <span
              className={`tabular-nums rounded-full px-1 text-[9px] leading-none font-semibold ${
                active
                  ? 'bg-white/25 text-white'
                  : 'bg-white text-gray-500 dark:bg-gray-900 dark:text-gray-400 ring-1 ring-gray-200 dark:ring-gray-700'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
