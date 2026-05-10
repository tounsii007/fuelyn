// ============================================================
// Search History — locale-aware "Letzte Suchen" chip strip
// ============================================================

'use client';

import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';

/**
 * Compact human-friendly relative time using the platform's own
 * Intl.RelativeTimeFormat. Examples:
 *   de    → "vor 2 Min", "gestern", "vor 3 Tagen"
 *   en    → "2 min ago", "yesterday", "3 days ago"
 *   fr    → "il y a 2 min", "hier", "il y a 3 jours"
 *
 * "just now" is special-cased because Intl.RelativeTimeFormat
 * doesn't have a sub-minute granularity that reads naturally —
 * "0 minutes ago" is awkward in every locale we support.
 */
function relativeTime(iso: string, locale: string, justNowLabel: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffSec = Math.max(0, (Date.now() - t) / 1000);
  if (diffSec < 60) return justNowLabel;

  // Try the locale-aware formatter; gracefully fall back to a
  // simple "Nm" template if the runtime doesn't ship the locale
  // (e.g. a stripped-down Node ICU build).
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  } catch {
    rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return rtf.format(-diffMin, 'minute');
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return rtf.format(-diffH, 'hour');
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return rtf.format(-diffD, 'day');
  const diffW = Math.floor(diffD / 7);
  return rtf.format(-diffW, 'week');
}

export function SearchHistory() {
  const { t, locale } = useTranslations();
  const history = useAppStore((s) => s.searchHistory);
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  const clearSearchHistory = useAppStore((s) => s.clearSearchHistory);

  if (history.length === 0) return null;

  const justNow = t('searchHistory.justNow');

  return (
    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          {t('searchHistory.title')}
        </h3>
        <button
          type="button"
          onClick={clearSearchHistory}
          className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          {t('searchHistory.clearLabel')}
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {history.map((entry, i) => {
          const when = entry.timestamp ? relativeTime(entry.timestamp, locale, justNow) : '';
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
