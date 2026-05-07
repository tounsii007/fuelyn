// ============================================================
// Search History — Letzte Suchen
// ============================================================

'use client';

import { useAppStore } from '@/lib/store/app-store';

export function SearchHistory() {
  const history = useAppStore((s) => s.searchHistory);
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  const clearSearchHistory = useAppStore((s) => s.clearSearchHistory);

  if (history.length === 0) return null;

  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Letzte Suchen
        </h3>
        <button
          type="button"
          onClick={clearSearchHistory}
          className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          L&ouml;schen
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {history.map((entry, i) => (
          <button
            key={`${entry.lat}-${entry.lng}-${i}`}
            type="button"
            onClick={() => setUserLocation({ lat: entry.lat, lng: entry.lng })}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full
                       bg-gray-100 dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300
                       hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="truncate max-w-[100px]">{entry.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
