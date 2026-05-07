// ============================================================
// SortBar — Sort mode selector and filter toggle
// ============================================================

'use client';

import type { SortMode } from '@tankpilot/core';
import { useAppStore } from '@/lib/store/app-store';

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'recommended', label: 'Empfohlen' },
  { value: 'cheapest', label: 'Günstigste' },
  { value: 'nearest', label: 'Nächste' },
  { value: 'open', label: 'Geöffnet' },
];

export function SortBar() {
  const sortMode = useAppStore((s) => s.sortMode);
  const setSortMode = useAppStore((s) => s.setSortMode);
  const setFilterOpen = useAppStore((s) => s.setFilterOpen);
  const filter = useAppStore((s) => s.filter);

  const activeFilterCount =
    filter.brands.length +
    (filter.onlyOpen ? 1 : 0) +
    (filter.priceMin != null ? 1 : 0) +
    (filter.priceMax != null ? 1 : 0);

  return (
    <div className="flex items-center gap-2 px-4 py-3 overflow-x-auto scrollbar-hide">
      {SORT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setSortMode(opt.value)}
          className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-all
            ${
              sortMode === opt.value
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
        >
          {opt.label}
        </button>
      ))}

      {/* Filter button */}
      <button
        type="button"
        onClick={() => setFilterOpen(true)}
        className={`flex-shrink-0 ml-auto p-2 rounded-xl transition-colors relative
          ${activeFilterCount > 0
            ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600'
            : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        aria-label="Filter öffnen"
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
  );
}
