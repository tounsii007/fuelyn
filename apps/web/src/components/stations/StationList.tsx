// ============================================================
// StationList -- Scrollable list of station cards with
// incremental "load more" pagination to avoid rendering
// hundreds of cards at once.
// ============================================================

'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { StationRecommendation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { StationCard } from './StationCard';
import { StationCardSkeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';
import { useAppStore } from '@/lib/store/app-store';
import { useInView } from '@/lib/hooks/use-in-view';

const PAGE_SIZE = 20;

interface StationListProps {
  recommendations: StationRecommendation[];
  isLoading: boolean;
  isError: boolean;
  onStationClick: (stationId: string) => void;
  onRetry?: () => void;
}

export function StationList({
  recommendations,
  isLoading,
  isError,
  onStationClick,
  onRetry,
}: StationListProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  /**
   * Phase 10 — Auto-load-more sentinel.
   *
   * Sentinel `<div>` rendered at the end of the visible list. When
   * the user scrolls and the sentinel intersects the viewport, we
   * extend `visibleCount` by another page. Falls back to the manual
   * "Mehr laden" button for keyboard users + reduced-motion sessions.
   *
   * This is "poor man's virtualisation" — DOM grows linearly but
   * each card stays cheap (no heavy charts, just SVG). For >200
   * results we'd switch to react-window proper; until then this is
   * sufficient and zero-dependency.
   */
  const sentinelRef = useRef<HTMLDivElement>(null);
  const sentinelInView = useInView(sentinelRef, { once: false, rootMargin: '300px' });

  // Reset visible count when the data set changes
  // (e.g. new search, filter change)
  const prevLenRef = useRef(recommendations.length);
  useEffect(() => {
    if (recommendations.length !== prevLenRef.current) {
      prevLenRef.current = recommendations.length;
      setVisibleCount(PAGE_SIZE);
    }
  }, [recommendations.length]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
    // Smooth-scroll the button into view after state update
    requestAnimationFrame(() => {
      loadMoreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, []);

  // ─── ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURN ──────────
  // The market-context selectors below USED to live below the
  // isLoading/isError/empty early-returns, which violated React's
  // Rules of Hooks: a render that hit an early return called only
  // 5 hooks; a render that didn't called 7. React 19's stricter
  // hydration-mismatch detection bubbled this up as a hard #310
  // ("Rendered more hooks than during the previous render") plus
  // a #418 hydration crash on every page load — the Homepage
  // mounts <StationList isLoading={true} /> first, then re-renders
  // with isLoading=false once React Query resolves, growing the
  // hook count between the two passes.
  //
  // Fix: hoist the store selector and memo to the top so the hook
  // count is constant regardless of which branch returns.
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const market = useMemo(() => {
    const prices: number[] = [];
    for (const r of recommendations) {
      const p = r.station.prices?.[fuelType];
      if (typeof p === 'number' && p > 0) prices.push(p);
    }
    if (prices.length === 0) {
      return { min: null as number | null, max: null as number | null, avg: null as number | null, count: 0 };
    }
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    return { min, max, avg, count: prices.length };
  }, [recommendations, fuelType]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <StationCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        icon={'\u26a0\ufe0f'}
        title="Daten konnten nicht geladen werden"
        message={'Die Preisdaten sind momentan nicht verf\u00fcgbar. Bitte versuche es erneut.'}
        action={onRetry ? { label: 'Erneut versuchen', onClick: onRetry } : undefined}
      />
    );
  }

  if (recommendations.length === 0) {
    // Tip-style empty state — three concrete things the user can
    // try, ranked by likelihood of helping. Cheaper than embedding
    // diagnostics ("which filter is biting?") and good enough to
    // unblock most users.
    return (
      <EmptyState
        icon="🔍"
        title="Keine Tankstellen gefunden"
        message={
          <span className="block">
            <span className="block mb-2">
              In der aktuellen Auswahl ist nichts dabei. Versuche eines davon:
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 inline-block text-left">
              • Suchradius vergrößern<br />
              • Andere Kraftstoffart wählen<br />
              • Filter zurücksetzen
            </span>
          </span>
        }
      />
    );
  }

  const total = recommendations.length;
  const shown = Math.min(visibleCount, total);
  const hasMore = shown < total;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/*
        Result count + price-range subtitle. The count is the
        primary signal ("X von Y Tankstellen"); the subtitle hangs
        a sparkline-style range hint underneath ("1,89 € – 2,05 €
        · Spanne 16 ct") so the user sees the spread before
        scrolling. Subtitle suppressed when fewer than 2 priced
        stations — a single price has no range to talk about.
      */}
      <div className="px-1 space-y-0.5">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {hasMore
            ? `${shown} von ${total} Tankstelle${total !== 1 ? 'n' : ''}`
            : `${total} Tankstelle${total !== 1 ? 'n' : ''} gefunden`}
        </p>
        {market.count >= 2 && market.min != null && market.max != null && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
            {market.min.toFixed(3).replace('.', ',')} €
            {' – '}
            {market.max.toFixed(3).replace('.', ',')} €
            {' · Spanne '}
            {Math.round((market.max - market.min) * 100)} ct
          </p>
        )}
      </div>

      {recommendations.slice(0, shown).map((rec, idx) => (
        <div
          key={rec.station.id}
          className="animate-fade-in-up"
          style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
        >
          <StationCard
            recommendation={rec}
            marketAvgForFuel={market.avg}
            marketMinForFuel={market.min}
            marketCount={market.count}
            onClick={() => onStationClick(rec.station.id)}
          />
        </div>
      ))}

      {/* Auto-load sentinel + manual fallback button */}
      {hasMore && (
        <>
          <div
            ref={sentinelRef}
            aria-hidden="true"
            className="h-1 w-full"
          />
          <button
            ref={loadMoreRef}
            type="button"
            onClick={handleLoadMore}
            className="mt-1 w-full py-2.5 text-xs font-semibold text-brand-600 dark:text-brand-400
                       bg-brand-50 dark:bg-brand-900/20 rounded-xl
                       hover:bg-brand-100 dark:hover:bg-brand-900/30
                       active:scale-[0.98] transition-all duration-150"
          >
            Mehr laden ({total - shown} weitere)
          </button>
        </>
      )}
    </div>
  );
}
