// ============================================================
// AchievementsPanel — visual surface for the user's badges.
//
// Phase 9. Renders a grid of cards, each showing one achievement
// with progress to the next tier. Earned badges glow brand-blue,
// in-progress ones are muted. Designed to be embedded into the
// Wrapped page or the Settings page; a standalone /achievements
// route is added so users can navigate directly.
// ============================================================

'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { ACHIEVEMENTS, type AchievementStats } from '@/lib/achievements';

interface AchievementsPanelProps {
  className?: string;
}

export function AchievementsPanel({ className = '' }: AchievementsPanelProps) {
  // ─── Derive stats from existing app-store data ────────────────
  // No new persistence layer — every value below is already tracked
  // somewhere (favorites, search history, fuel-log, price alerts).
  const favorites = useAppStore((s) => s.favorites);
  const searchHistory = useAppStore((s) => s.searchHistory);
  const priceHistory = useAppStore((s) => s.priceHistory);
  const fuelLog = useAppStore((s) => (s as { fuelLog?: unknown[] }).fuelLog ?? []);
  const reportsCount = useAppStore(
    (s) => (s as { reportsSubmitted?: number }).reportsSubmitted ?? 0,
  );

  const stats: AchievementStats = useMemo(() => {
    // "Stations explored" ≈ unique stations that ever appeared in
    // search history or favorites. Imperfect but doesn't need any
    // schema change.
    const seen = new Set<string>();
    for (const f of favorites) seen.add(f.stationId);
    for (const s of searchHistory) seen.add(`${s.lat},${s.lng}`);

    // Streak: count consecutive distinct days with at least one
    // priceHistory entry, walking backward from today.
    const days = new Set<string>();
    for (const p of priceHistory) {
      try {
        days.add(new Date(p.timestamp).toISOString().slice(0, 10));
      } catch { /* ignore */ }
    }
    const today = new Date();
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (days.has(key)) streak++;
      else if (i === 0) {
        // No entry today is fine — break the streak only after
        // a missing day BEFORE today.
      } else {
        break;
      }
    }

    const fuelTypes = new Set<string>();
    for (const p of priceHistory) fuelTypes.add(p.fuelType);

    // centsSaved is cumulative: sum of (avg-day ⌀ − price observed)
    // across the user's price-history entries. Negative values clip
    // to zero so a single expensive day doesn't subtract.
    const grouped: Record<string, number[]> = {};
    for (const p of priceHistory) {
      const key = new Date(p.timestamp).toISOString().slice(0, 10) + ':' + p.fuelType;
      (grouped[key] ??= []).push(p.price);
    }
    let centsSaved = 0;
    for (const arr of Object.values(grouped)) {
      const avg = arr.reduce((s, n) => s + n, 0) / arr.length;
      const cheapest = Math.min(...arr);
      centsSaved += Math.max(0, (avg - cheapest) * 100);
    }

    return {
      stationsExplored: seen.size,
      centsSaved: Math.round(centsSaved),
      reportsSubmitted: reportsCount,
      streakDays: streak,
      refuelsLogged: fuelLog.length,
      fuelTypesUsed: fuelTypes.size,
    };
  }, [favorites, searchHistory, priceHistory, fuelLog, reportsCount]);

  const evaluated = useMemo(
    () => ACHIEVEMENTS.map((a) => ({ ach: a, ...a.evaluate(stats) })),
    [stats],
  );

  const earned = evaluated.filter((e) => e.earned);
  const inProgress = evaluated.filter((e) => !e.earned);

  return (
    <div className={`space-y-4 ${className}`}>
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Achievements</h2>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 tabular-nums">
          {earned.length} / {evaluated.length} freigeschaltet
        </span>
      </header>

      {/* Earned (highlighted) */}
      {earned.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {earned.map(({ ach }) => (
            <Card key={ach.id} a={ach} earned progress={1} current={ach.goal} />
          ))}
        </div>
      )}

      {inProgress.length > 0 && (
        <>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Noch zu freischalten
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {inProgress.map(({ ach, progress, current }) => (
              <Card key={ach.id} a={ach} earned={false} progress={progress} current={current} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface CardProps {
  a: typeof ACHIEVEMENTS[number];
  earned: boolean;
  progress: number;
  current: number;
}

function Card({ a, earned, progress, current }: CardProps) {
  const tierGlow =
    a.tier === 'gold'
      ? 'shadow-[0_4px_18px_rgba(245,158,11,0.25)] ring-amber-300/60'
      : a.tier === 'silver'
        ? 'shadow-[0_4px_18px_rgba(148,163,184,0.20)] ring-slate-300/60'
        : 'shadow-[0_4px_18px_rgba(180,83,9,0.18)] ring-amber-200/60';

  const valueLabel = (() => {
    switch (a.unit) {
      case 'cents':   return `${(current / 100).toFixed(0)} €`;
      case 'stations':return `${current}`;
      case 'reports': return `${current}`;
      case 'days':    return `${current} Tage`;
      case 'refuels': return `${current}`;
      case 'fuelTypes': return `${current}`;
    }
  })();

  return (
    <article
      className={[
        'rounded-2xl p-3 fy-card-interactive ring-1',
        earned
          ? `bg-white dark:bg-white/[0.04] ${tierGlow}`
          : 'bg-gray-50 dark:bg-white/[0.02] ring-gray-200 dark:ring-white/10',
      ].join(' ')}
    >
      <div className="flex items-start justify-between mb-1.5">
        <span className={`text-2xl ${earned ? '' : 'opacity-30 grayscale'}`}>{a.icon}</span>
        <span
          className={[
            'inline-flex px-1.5 py-0 rounded-full text-[9px] font-bold uppercase tracking-wider',
            earned
              ? a.tier === 'gold'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                : a.tier === 'silver'
                  ? 'bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200'
                  : 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200'
              : 'bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-400',
          ].join(' ')}
        >
          {a.tier}
        </span>
      </div>
      <h4 className={`text-sm font-bold ${earned ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
        {a.title}
      </h4>
      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug mt-0.5 mb-2">
        {a.description}
      </p>
      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-white/5 overflow-hidden">
        <div
          className={[
            'h-full rounded-full transition-all duration-500',
            earned
              ? a.tier === 'gold'
                ? 'bg-gradient-to-r from-amber-400 to-amber-600'
                : a.tier === 'silver'
                  ? 'bg-gradient-to-r from-slate-400 to-slate-600'
                  : 'bg-gradient-to-r from-orange-400 to-orange-600'
              : 'bg-brand-500/70',
          ].join(' ')}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
        {valueLabel} / {a.unit === 'cents' ? `${(a.goal / 100).toFixed(0)} €` : a.goal}
      </p>
    </article>
  );
}
