// ============================================================
// Search History — Letzte Suchen
// ============================================================

'use client';

import { useAppStore } from '@/lib/store/app-store';

/**
 * Compact human-friendly relative time ("vor 2 Min", "gestern",
 * "vor 3 Tagen"). Tankerkönig-style brevity — we don't need
 * second-level precision here, only a "is this fresh enough to
 * still be relevant?" cue.
 */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffSec = Math.max(0, (Date.now() - t) / 1000);
  if (diffSec < 60) return 'gerade eben';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `vor ${diffMin} Min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'gestern';
  if (diffD < 7) return `vor ${diffD} Tagen`;
  const diffW = Math.floor(diffD / 7);
  if (diffW === 1) return 'vor 1 Woche';
  return `vor ${diffW} Wochen`;
}

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
          Löschen
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {history.map((entry, i) => {
          const when = entry.timestamp ? relativeTime(entry.timestamp) : '';
          return (
            <button
              key={`${entry.lat}-${entry.lng}-${i}`}
              type="button"
              onClick={() => setUserLocation({ lat: entry.lat, lng: entry.lng })}
              title={when ? `${entry.label} — ${when}` : entry.label}
              className="group flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full
                         bg-gray-100 dark:bg-gray-800 text-xs text-gray-700 dark:text-gray-300
                         hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-3 h-3 text-gray-400 group-hover:text-brand-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="truncate max-w-[110px]">{entry.label}</span>
              {/*
                Inline relative timestamp — tells the user how
                stale this saved location is so a 6-week-old
                search isn't presented as fresh as one from
                30 minutes ago. Kept tiny and dimmed so it
                doesn't dominate the chip.
              */}
              {when && (
                <span className="text-[9px] font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">
                  · {when}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
