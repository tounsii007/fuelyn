// ============================================================
// Opening Hours Detail — Öffnungszeiten-Detail
// ============================================================

'use client';

import { useMemo } from 'react';
import type { OpeningTime } from '@fuelyn/core';

interface OpeningHoursDetailProps {
  openingTimes: readonly OpeningTime[];
  wholeDay: boolean;
  overrides: readonly string[];
  isOpen: boolean;
}

const DAY_ORDER = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const DAY_SHORT: Record<string, string> = {
  Montag: 'Mo', Dienstag: 'Di', Mittwoch: 'Mi', Donnerstag: 'Do',
  Freitag: 'Fr', Samstag: 'Sa', Sonntag: 'So',
};

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
  const today = useMemo(() => {
    const d = new Date();
    return DAY_ORDER[d.getDay() === 0 ? 6 : d.getDay() - 1]!;
  }, []);

  // Group times by day
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
            Durchgehend ge&ouml;ffnet (24/7)
          </h2>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Diese Tankstelle ist rund um die Uhr ge&ouml;ffnet.
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
          {isOpen ? 'Ge\u00f6ffnet' : 'Geschlossen'}
        </h2>
      </div>

      <div className="space-y-1.5">
        {DAY_ORDER.map((day) => {
          const slots = byDay.get(day);
          const isToday = day === today;
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
                {DAY_SHORT[day]}
              </span>

              {/* Time bar visualization */}
              <div className="flex-1 relative h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                {slots?.map((slot, i) => {
                  const left = parseTimeToPercent(slot.start);
                  const right = parseTimeToPercent(slot.end);
                  if (left == null || right == null) return null;
                  const width = right > left ? right - left : 100 - left + right;
                  return (
                    <div
                      key={i}
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
                  ? slots.map((s) => `${s.start}\u2013${s.end}`).join(', ')
                  : 'Geschlossen'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Overrides / Holidays */}
      {overrides.length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Sonder&ouml;ffnungszeiten</h3>
          {overrides.map((o, i) => (
            <p key={i} className="text-xs text-gray-600 dark:text-gray-400">{o}</p>
          ))}
        </div>
      )}
    </div>
  );
}
