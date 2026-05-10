// ============================================================
// SortBar — Sort mode selector and filter toggle
// ============================================================

'use client';

import type { SortMode } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'recommended', label: 'Empfohlen' },
  { value: 'cheapest', label: 'Günstigste' },
  { value: 'nearest', label: 'Nächste' },
  { value: 'open', label: 'Geöffnet' },
];

export interface SortBarProps {
  /**
   * Optional per-mode hit counts. When supplied, each sort pill
   * renders a small number badge to its right ("Geöffnet 12").
   * A `null` count is rendered as "—" so users see "data missing"
   * instead of nothing — important for the Geöffnet pill which
   * can legitimately be 0 vs. unknown. Pass `undefined` to
   * suppress badging entirely (the original behaviour).
   */
  readonly counts?: Partial<Record<SortMode, number | null>>;
}

export function SortBar({ counts }: SortBarProps = {}) {
  const { t } = useTranslations();
  const sortMode = useAppStore((s) => s.sortMode);
  const setSortMode = useAppStore((s) => s.setSortMode);
  const setFilterOpen = useAppStore((s) => s.setFilterOpen);
  const setFilter = useAppStore((s) => s.setFilter);
  const filter = useAppStore((s) => s.filter);

  const activeFilterCount =
    filter.brands.length +
    (filter.onlyOpen ? 1 : 0) +
    (filter.priceMin != null ? 1 : 0) +
    (filter.priceMax != null ? 1 : 0);

  // Build a list of removable chips reflecting every active filter.
  // Each chip carries an `onRemove` that calls setFilter with just
  // the field needed to clear it — no full filter rewrite. The list
  // is empty when nothing is active, in which case the chips row
  // is suppressed entirely.
  const activeChips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filter.onlyOpen) {
    activeChips.push({ key: 'open', label: 'Nur geöffnet', onRemove: () => setFilter({ onlyOpen: false }) });
  }
  if (filter.priceMin != null) {
    activeChips.push({
      key: 'min',
      label: `≥ ${filter.priceMin.toFixed(2)} €`,
      onRemove: () => setFilter({ priceMin: null }),
    });
  }
  if (filter.priceMax != null) {
    activeChips.push({
      key: 'max',
      label: `≤ ${filter.priceMax.toFixed(2)} €`,
      onRemove: () => setFilter({ priceMax: null }),
    });
  }
  for (const brand of filter.brands) {
    activeChips.push({
      key: `brand:${brand}`,
      label: brand,
      onRemove: () =>
        setFilter({ brands: filter.brands.filter((b) => b !== brand) }),
    });
  }

  return (
    <>
    <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
      {SORT_OPTIONS.map((opt) => {
        const count = counts ? counts[opt.value] : undefined;
        const isActive = sortMode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setSortMode(opt.value)}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all
              ${
                isActive
                  ? 'bg-brand-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
          >
            <span>{opt.label}</span>
            {/*
              Inline count badge — gives the user a quick "are
              there any open stations at all?" signal without
              having to click the tab to find out. Tone follows
              the active state: white-on-translucent for the
              active pill, gray-on-soft for the inactive ones.
            */}
            {count !== undefined && (
              <span
                className={`tabular-nums rounded-full px-1.5 py-0.5 text-[10px] leading-none font-semibold ${
                  isActive
                    ? 'bg-white/25 text-white'
                    : 'bg-white text-gray-500 ring-1 ring-gray-200 dark:bg-gray-900 dark:text-gray-400 dark:ring-gray-700'
                }`}
              >
                {count == null ? '—' : count > 99 ? '99+' : count}
              </span>
            )}
          </button>
        );
      })}

      {/* Filter button */}
      <button
        type="button"
        onClick={() => setFilterOpen(true)}
        className={`flex-shrink-0 ml-auto p-2 rounded-xl transition-colors relative
          ${activeFilterCount > 0
            ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600'
            : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        aria-label={t('miscAria.filterOpen')}
      >
        <svg className={`w-4 h-4 ${activeFilterCount > 0 ? 'text-brand-600' : 'text-gray-600 dark:text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
        </svg>
        {activeFilterCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-600 text-white
                           rounded-full text-[9px] font-bold flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>

    {/*
      Active-filter chips row — renders only when at least one
      filter is set. Each chip shows the filter's friendly label
      (e.g. "Nur geöffnet", "≥ 1,80 €", "Aral") and an "×" button
      to clear THAT specific filter without opening the full
      filter sheet. Beats the previous "filter-pill with a count"
      pattern because users see WHAT is active, not just HOW MANY.
    */}
    {activeChips.length > 0 && (
      <div className="flex items-center gap-1.5 px-4 pb-3 -mt-1 overflow-x-auto scrollbar-hide">
        {activeChips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={chip.onRemove}
            className="flex-shrink-0 inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full
                       bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300
                       text-[11px] font-medium
                       ring-1 ring-brand-200 dark:ring-brand-800/60
                       hover:bg-brand-100 dark:hover:bg-brand-900/50 transition-colors"
            aria-label={`Filter "${chip.label}" entfernen`}
            title={`Filter "${chip.label}" entfernen`}
          >
            <span>{chip.label}</span>
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ))}
      </div>
    )}
    </>
  );
}
