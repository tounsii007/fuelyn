// ============================================================
// Opening Hours Detail — locale-aware "Öffnungszeiten" panel.
//
// Day-name handling note: the upstream Tankerkönig API returns
// `ot.text` as a German weekday name ("Montag", "Dienstag", …),
// so the DAY_ORDER constant has to keep those German keys for
// the `byDay.get(day)` lookup. The DISPLAYED short label and the
// "today" comparison both go through Intl.DateTimeFormat against
// the active locale, so French/English users see "lun." / "Mon"
// even though the backing data is still keyed in German.
// ============================================================

'use client';

import { useMemo } from 'react';
import type { OpeningTime } from '@fuelyn/core';
import { useTranslations } from '@/lib/hooks/use-translations';

interface OpeningHoursDetailProps {
  openingTimes: readonly OpeningTime[];
  wholeDay: boolean;
  overrides: readonly string[];
  isOpen: boolean;
}

// Lookup keys that match the German strings the API returns.
// DO NOT translate these — they're data identifiers, not UI copy.
const DAY_ORDER = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'] as const;

/**
 * Build a locale-aware short label (e.g. "Mo", "Lun.", "Mon") for
 * the day at the given Mo-first index (0 = Monday). Uses any week
 * containing a known Monday — Jan 6 2025 was a Monday, so we
 * anchor there.
 */
function shortDayLabel(index: number, locale: string): string {
  const anchorMonday = new Date(2025, 0, 6); // 6 Jan 2025 = Mo
  const date = new Date(anchorMonday);
  date.setDate(anchorMonday.getDate() + index);
  try {
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en', { weekday: 'short' }).format(date);
  }
}

function parseTimeToPercent(time: string): number | null {
  const [hourRaw, minuteRaw] = time.split(':');
  const hour = Number.parseInt(hourRaw ?? '', 10);
  const minute = Number.parseInt(minuteRaw ?? '', 10);

  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return ((hour * 60 + minute) / (24 * 60)) * 100;
}

export function OpeningHoursDetail({ openingTimes, wholeDay, overrides, isOpen }: OpeningHoursDetailProps) {
  const { t, locale } = useTranslations();

  const todayIndex = useMemo(() => {
    const d = new Date();
    // JS getDay: 0=Sunday, 1=Monday — convert to Mo-first 0=Monday, 6=Sunday
    return d.getDay() === 0 ? 6 : d.getDay() - 1;
  }, []);

  // Group times by day (lookup key is the German weekday text from
  // the API — see file header note).
  const byDay = useMemo(() => {
    const map = new Map<string, { start: string; end: string }[]>();
    for (const ot of openingTimes) {
      const existing = map.get(ot.text) || [];
      existing.push({ start: ot.start, end: ot.end });
      map.set(ot.text, existing);
    }
    return map;
  }, [openingTimes]);

  if (wholeDay) {
    return (
      <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-reach-safe" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            {t('openingHours.allDayHeading')}
          </h2>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('openingHours.allDayDesc')}
        </p>
      </div>
    );
  }

  if (openingTimes.length === 0) return null;

  return (
    <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className={`w-2 h-2 rounded-full ${isOpen ? 'bg-reach-safe' : 'bg-gray-300'}`} />
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {isOpen ? t('station.open') : t('station.closed')}
        </h2>
      </div>

      <div className="space-y-1.5">
        {DAY_ORDER.map((day, i) => {
          const slots = byDay.get(day);
          const isToday = i === todayIndex;
          return (
            <div
              key={day}
              className={`flex items-center gap-3 py-1.5 px-2 rounded-lg text-sm ${
                isToday ? 'bg-brand-50 dark:bg-brand-900/10' : ''
              }`}
            >
              <span className={`w-8 text-xs font-medium ${
                isToday ? 'text-brand-600 font-bold' : 'text-gray-500 dark:text-gray-400'
              }`}>
                {shortDayLabel(i, locale)}
              </span>

              {/* Time bar visualization */}
              <div className="flex-1 relative h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                {slots?.map((slot, j) => {
                  const left = parseTimeToPercent(slot.start);
                  const right = parseTimeToPercent(slot.end);
                  if (left == null || right == null) return null;
                  const width = right > left ? right - left : 100 - left + right;
                  return (
                    <div
                      key={j}
                      className={`absolute top-0 h-full rounded-full ${
                        isToday ? 'bg-brand-500' : 'bg-gray-400 dark:bg-gray-500'
                      }`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    />
                  );
                })}
              </div>

              <span className={`text-xs min-w-[90px] text-right ${
                isToday ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'
              }`}>
                {slots
                  ? slots.map((s) => `${s.start}–${s.end}`).join(', ')
                  : t('station.closed')}
              </span>
            </div>
          );
        })}
      </div>

      {/* Overrides / Holidays */}
      {overrides.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">{t('openingHours.holidays')}</h3>
          {overrides.map((o, i) => (
            <p key={i} className="text-xs text-gray-600 dark:text-gray-400">{o}</p>
          ))}
        </div>
      )}
    </div>
  );
}
