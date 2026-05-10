// ============================================================
// /achievements — Trophy wall: badges + progress + points.
// ============================================================

'use client';

import { useMemo } from 'react';
import {
  computeAchievements,
  type Achievement,
  type AchievementCategory,
} from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';
import { AppShell } from '@/components/layout/AppShell';

const CATEGORY_ICON: Record<AchievementCategory, string> = {
  streak: '🔥',
  milestone: '🏆',
  co2: '🌳',
  time: '⏰',
  variety: '🎨',
  savings: '💰',
};

const CATEGORY_COLOR: Record<AchievementCategory, string> = {
  streak: 'from-rose-500 to-orange-500',
  milestone: 'from-amber-400 to-yellow-500',
  co2: 'from-emerald-400 to-emerald-600',
  time: 'from-sky-400 to-indigo-500',
  variety: 'from-violet-500 to-fuchsia-500',
  savings: 'from-emerald-500 to-cyan-500',
};

export default function AchievementsPage() {
  return (
    <AppShell>
      <AchievementsContent />
    </AppShell>
  );
}

function AchievementsContent() {
  const { t, locale } = useTranslations();
  const hydrated = useIsHydrated();
  const fuelLog = useAppStore((s) => s.fuelLog);
  const market = useAppStore((s) => s.priceHistory);

  const result = useMemo(
    () => computeAchievements(fuelLog, market),
    [fuelLog, market],
  );

  if (!hydrated) return null;

  const dateFmt = (iso: string | null) =>
    !iso
      ? '—'
      : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(
          new Date(iso),
        );

  return (
    <div className="max-w-3xl mx-auto p-6 animate-fade-in">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--color-fg)]">
          {t('achievements.title')}
        </h1>
        <p className="text-sm text-[var(--color-fg-subtle)] mt-1">
          {t('achievements.subtitle')
            .replace('{unlocked}', String(result.unlockedCount))
            .replace('{total}', String(result.totalCount))
            .replace('{points}', String(result.points))}
        </p>
      </header>

      {result.unlockedCount === 0 && fuelLog.length === 0 && (
        <div className="bg-[var(--color-surface)] rounded-2xl p-6 text-center border border-[var(--color-border-subtle)]">
          <span className="text-4xl mb-3 inline-block">🌱</span>
          <p className="text-sm text-[var(--color-fg)]">{t('achievements.emptyTitle')}</p>
          <p className="text-xs text-[var(--color-fg-subtle)] mt-1">{t('achievements.emptyHint')}</p>
        </div>
      )}

      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {result.achievements.map((a) => (
          <li key={a.id}>
            <Card achievement={a} t={t} dateFmt={dateFmt} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({
  achievement,
  t,
  dateFmt,
}: {
  achievement: Achievement;
  t: (k: string) => string;
  dateFmt: (iso: string | null) => string;
}) {
  const { id, category, unlocked, progress, current, target, unlockedAt } = achievement;
  const tone = unlocked
    ? `bg-gradient-to-br ${CATEGORY_COLOR[category]} text-white`
    : 'bg-[var(--color-surface)] text-[var(--color-fg-subtle)] border border-[var(--color-border-subtle)]';

  return (
    <div
      className={`relative rounded-2xl p-3 overflow-hidden ${tone}
                  shadow-[var(--shadow-sm)] transition-all duration-200
                  ${unlocked ? 'hover:scale-[1.02]' : 'opacity-80'}`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className={`text-2xl ${unlocked ? '' : 'grayscale opacity-60'}`} aria-hidden="true">
          {CATEGORY_ICON[category]}
        </span>
        {unlocked && (
          <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full">
            {t('achievements.unlockedBadge')}
          </span>
        )}
      </div>
      <h3 className={`text-sm font-bold ${unlocked ? 'text-white' : 'text-[var(--color-fg)]'} mb-0.5`}>
        {t(`achievements.items.${id}.label`)}
      </h3>
      <p className={`text-[11px] leading-snug ${unlocked ? 'text-white/85' : 'text-[var(--color-fg-subtle)]'}`}>
        {t(`achievements.items.${id}.desc`)}
      </p>

      {!unlocked && current !== undefined && target !== undefined && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] text-[var(--color-fg-subtle)] mb-1">
            <span className="tabular-nums">
              {current.toLocaleString()} / {target.toLocaleString()}
            </span>
            <span className="tabular-nums">{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--color-border)] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--color-brand-500)] to-[var(--color-brand-300)]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}

      {unlocked && unlockedAt && (
        <p className="mt-2 text-[10px] text-white/75">
          {t('achievements.unlockedOn')} {dateFmt(unlockedAt)}
        </p>
      )}
    </div>
  );
}
