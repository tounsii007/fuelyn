// ============================================================
// CompareTray — Floating "X von 3 zum Vergleich gewählt" pill
//
// Appears at the bottom-centre of the screen as soon as the user
// adds the first station to the compare set, and disappears again
// when the set is empty. One-tap CTA jumps straight to /compare;
// a separate × clears the entire set without navigating.
//
// Mounts globally inside <AppShell>. Cheap when empty: returns
// null without rendering anything, so it's safe to leave on
// every page.
// ============================================================

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';

export function CompareTray() {
  const { t } = useTranslations();
  const ids = useAppStore((s) => s.compareStationIds);
  const clearCompare = useAppStore((s) => s.clearCompare);
  const pathname = usePathname();

  // No items → invisible. Also hide on /compare itself, where the
  // tray would just duplicate the page's own controls.
  if (ids.length === 0) return null;
  if (pathname === '/compare') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 z-[1000]
                 bottom-[max(1rem,env(safe-area-inset-bottom))]
                 md:bottom-4
                 flex items-center gap-2 px-3 py-2 rounded-full
                 bg-[var(--color-fg)] text-[var(--color-bg)]
                 shadow-[var(--shadow-lg)]
                 animate-fade-in-up"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full
                       bg-[var(--color-brand-600)] text-white text-[11px] font-bold tabular-nums">
        {ids.length}
      </span>
      <span className="text-xs font-medium pr-1">
        {ids.length === 1 ? t('station.stationSingular') : t('station.stations')}{' '}
        <span className="opacity-70">{t('compare.trayLabel')}</span>
      </span>
      <Link
        href="/compare"
        className="ml-1 inline-flex items-center gap-1 rounded-full
                   bg-[var(--color-brand-600)] hover:bg-[var(--color-brand-700)]
                   px-3 py-1 text-xs font-semibold text-white
                   transition-colors"
      >
        {t('compare.cta')}
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>
      <button
        type="button"
        onClick={clearCompare}
        className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full
                   text-[var(--color-bg-subtle)] hover:bg-white/10 transition-colors"
        aria-label={t('compare.clearAll')}
        title={t('compare.clearAll')}
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
