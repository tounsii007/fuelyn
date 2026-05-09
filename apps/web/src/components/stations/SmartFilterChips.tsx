// ============================================================
// SmartFilterChips — sticky horizontal chip-bar that filters the
// recommendations array using only data that's already present in
// the BFF response (price, distance, brand, isOpen, reachability).
//
// No backend extension required. The chips translate UI-state into
// a filter predicate that's applied client-side; the parent passes
// the filtered list to StationList.
//
// Why a horizontal scroll bar?
//   • Mobile-first: takes one row, fits ~3 chips visible + scroll
//   • Discoverable: chips are just buttons with active-states, no
//     hidden modal
//   • Composable: multiple chips can stack (e.g. open + cheap + safe)
// ============================================================

'use client';

import { useMemo } from 'react';
import type { FuelType, StationRecommendation } from '@fuelyn/core';

export type SmartFilterId =
  | 'open'
  | 'top3'
  | 'underAvg'
  | 'safe'
  | 'aral'
  | 'shell'
  | 'esso'
  | 'jet'
  | 'star'
  | 'total';

interface SmartFilterChipsProps {
  recommendations: ReadonlyArray<StationRecommendation>;
  active: ReadonlySet<SmartFilterId>;
  onToggle: (id: SmartFilterId) => void;
  /**
   * Active fuel type — typed narrowly so `prices[fuelType]` indexes the
   * `StationPrices` record without falling back to `any`. The caller's
   * filter store already exposes `'diesel' | 'e5' | 'e10'`, so this is a
   * tightening, not a breaking change.
   */
  fuelType: FuelType;
  /** Optional callback to clear all filters. */
  onClear?: () => void;
}

const CHIPS: Array<{
  id: SmartFilterId;
  label: string;
  /** Lucide-style inline path. */
  icon: string;
  /** Brand-style accent for active state — emerald for "deals", brand-blue for safety, etc. */
  tint: 'emerald' | 'brand' | 'amber' | 'gray';
}> = [
  { id: 'open',     label: 'Geöffnet',  icon: 'M5 13l4 4L19 7',                               tint: 'emerald' },
  { id: 'top3',     label: 'Top 3',     icon: 'M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z', tint: 'amber' },
  { id: 'underAvg', label: '≤ Markt-⌀', icon: 'M19 14l-7 7-7-7M19 8l-7 7-7-7',                tint: 'emerald' },
  { id: 'safe',     label: 'Sicher',    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', tint: 'brand' },
  { id: 'aral',     label: 'Aral',      icon: '',                                              tint: 'gray' },
  { id: 'shell',    label: 'Shell',     icon: '',                                              tint: 'gray' },
  { id: 'esso',     label: 'Esso',      icon: '',                                              tint: 'gray' },
  { id: 'jet',      label: 'JET',       icon: '',                                              tint: 'gray' },
  { id: 'star',     label: 'Star',      icon: '',                                              tint: 'gray' },
  { id: 'total',    label: 'TotalEnergies', icon: '',                                          tint: 'gray' },
];

const TINT_ACTIVE: Record<typeof CHIPS[number]['tint'], string> = {
  emerald: 'bg-emerald-500/15 text-emerald-700 ring-emerald-500/40 dark:text-emerald-300',
  brand:   'bg-brand-500/15  text-brand-700  ring-brand-500/40  dark:text-brand-300',
  amber:   'bg-amber-500/15  text-amber-700  ring-amber-500/40  dark:text-amber-300',
  gray:    'bg-gray-200      text-gray-900   ring-gray-300      dark:bg-white/10 dark:text-gray-100 dark:ring-white/20',
};

export function SmartFilterChips({
  recommendations,
  active,
  onToggle,
  fuelType,
  onClear,
}: SmartFilterChipsProps) {
  // Per-chip count so users see "Geöffnet (12)" before clicking — gives
  // confidence that the filter will actually leave results behind.
  const counts = useMemo(() => {
    const cohortPrices = recommendations
      .map((r) => r.station.prices?.[fuelType])
      .filter((p): p is number => typeof p === 'number' && p > 0);
    const avg =
      cohortPrices.length > 0
        ? cohortPrices.reduce((s, p) => s + p, 0) / cohortPrices.length
        : null;

    const matches = (r: StationRecommendation, id: SmartFilterId): boolean => {
      const p = r.station.prices?.[fuelType];
      switch (id) {
        case 'open':     return r.station.isOpen === true;
        case 'underAvg': return avg != null && typeof p === 'number' && p < avg;
        case 'safe':     return r.reachabilityStatus === 'safe';
        case 'aral':     return /aral/i.test(r.station.brand || '');
        case 'shell':    return /shell/i.test(r.station.brand || '');
        case 'esso':     return /esso/i.test(r.station.brand || '');
        case 'jet':      return /\bjet\b/i.test(r.station.brand || '');
        case 'star':     return /\bstar\b/i.test(r.station.brand || '');
        case 'total':    return /total/i.test(r.station.brand || '');
        case 'top3':     return false; // computed below as positional
      }
    };

    const out: Record<SmartFilterId, number> = {
      open: 0, top3: Math.min(3, recommendations.length),
      underAvg: 0, safe: 0,
      aral: 0, shell: 0, esso: 0, jet: 0, star: 0, total: 0,
    };
    for (const r of recommendations) {
      (['open', 'underAvg', 'safe', 'aral', 'shell', 'esso', 'jet', 'star', 'total'] as SmartFilterId[]).forEach((id) => {
        if (matches(r, id)) out[id]++;
      });
    }
    return out;
  }, [recommendations, fuelType]);

  // Hide brand chips that match zero stations in the current cohort —
  // a "Shell (0)" chip is just clutter when the user isn't near one.
  const visibleChips = CHIPS.filter((c) => {
    const isBrand = ['aral', 'shell', 'esso', 'jet', 'star', 'total'].includes(c.id);
    return !isBrand || counts[c.id] > 0;
  });

  const hasAnyActive = active.size > 0;

  return (
    <div
      role="toolbar"
      aria-label="Schnellfilter"
      className="sticky top-[-1px] z-10 px-3 py-2 flex items-center gap-1.5
                 overflow-x-auto fy-scroll-thin
                 bg-[var(--color-bg)]/85 backdrop-blur-md
                 border-b border-[var(--color-border-subtle)]"
    >
      {visibleChips.map((c) => {
        const isActive = active.has(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onToggle(c.id)}
            aria-pressed={isActive}
            className={[
              'inline-flex items-center gap-1.5 flex-shrink-0',
              'h-7 px-2.5 rounded-full text-[11px] font-medium',
              'ring-1 transition-all duration-150 active:scale-95',
              isActive
                ? TINT_ACTIVE[c.tint] + ' shadow-sm'
                : 'bg-white/70 text-gray-600 ring-gray-200 hover:ring-gray-300 dark:bg-white/[0.04] dark:text-gray-400 dark:ring-white/10 dark:hover:ring-white/20',
            ].join(' ')}
          >
            {c.icon && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d={c.icon} />
              </svg>
            )}
            <span>{c.label}</span>
            {counts[c.id] > 0 && (
              <span className="text-[10px] opacity-70 tabular-nums">{counts[c.id]}</span>
            )}
          </button>
        );
      })}
      {hasAnyActive && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ml-1 flex-shrink-0 inline-flex items-center gap-1 h-7 px-2.5 rounded-full
                     text-[11px] font-medium text-gray-500 hover:text-gray-800
                     dark:text-gray-400 dark:hover:text-gray-100"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Zurücksetzen
        </button>
      )}
    </div>
  );
}

/**
 * Apply the chip-set to a recommendations array. Pure function so
 * callers can memoise the result alongside the chip state.
 */
export function applySmartChips(
  recommendations: ReadonlyArray<StationRecommendation>,
  active: ReadonlySet<SmartFilterId>,
  fuelType: FuelType,
): ReadonlyArray<StationRecommendation> {
  if (active.size === 0) return recommendations;

  // Compute market avg once per call — cheap, used by the underAvg chip.
  const cohortPrices = recommendations
    .map((r) => r.station.prices?.[fuelType])
    .filter((p): p is number => typeof p === 'number' && p > 0);
  const avg =
    cohortPrices.length > 0
      ? cohortPrices.reduce((s, p) => s + p, 0) / cohortPrices.length
      : null;

  let filtered = recommendations.filter((r) => {
    const p = r.station.prices?.[fuelType];
    if (active.has('open')     && !r.station.isOpen) return false;
    if (active.has('underAvg') && (avg == null || typeof p !== 'number' || p >= avg)) return false;
    if (active.has('safe')     && r.reachabilityStatus !== 'safe') return false;

    // Brand chips: at least one brand chip set → station must match one of them.
    const brandChipsActive = (['aral', 'shell', 'esso', 'jet', 'star', 'total'] as const).filter((b) => active.has(b));
    if (brandChipsActive.length > 0) {
      const brand = (r.station.brand || '').toLowerCase();
      const matchesAnyBrand = brandChipsActive.some((b) =>
        b === 'jet'
          ? /\bjet\b/.test(brand)
          : b === 'star'
            ? /\bstar\b/.test(brand)
            : brand.includes(b === 'total' ? 'total' : b),
      );
      if (!matchesAnyBrand) return false;
    }
    return true;
  });

  // top3 is positional — applied LAST so we slice from the already-filtered set.
  if (active.has('top3')) filtered = filtered.slice(0, 3);

  return filtered;
}
