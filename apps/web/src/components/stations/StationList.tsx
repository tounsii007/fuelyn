// ============================================================
// StationList -- Scrollable list of station cards with
// incremental "load more" pagination to avoid rendering
// hundreds of cards at once.
// ============================================================

'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { StationRecommendation } from '@fuelyn/core';
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

  // Auto-extend the visible window whenever the sentinel scrolls
  // into the pre-fetch zone. We don't smooth-scroll here — the user
  // is already moving downward, hijacking their scroll would feel
  // wrong.
  useEffect(() => {
    if (sentinelInView && visibleCount < recommendations.length) {
      setVisibleCount((v) => v + PAGE_SIZE);
    }
  }, [sentinelInView, visibleCount, recommendations.length]);

  // Cohort average for the currently filtered fuel type — used by
  // StationCard to render its delta-vs-⌀ badge. Recomputed once per
  // recommendations / fuel-type change; cheap (≤ 200 stations).
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const marketAvg = useMemo<number | null>(() => {
    const prices = recommendations
      .map((r) => r.station.prices?.[fuelType])
      .filter((p): p is number => typeof p === 'number' && p > 0);
    if (prices.length < 2) return null;
    return prices.reduce((s, p) => s + p, 0) / prices.length;
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
    return (
      <EmptyState
        title="Keine Tankstellen gefunden"
        message="Versuche einen größeren Suchradius oder ändere deine Filter."
      />
    );
  }

  const total = recommendations.length;
  const shown = Math.min(visibleCount, total);
  const hasMore = shown < total;

  return (
    <div className="flex flex-col gap-2 px-3 py-2">
      {/* Result count */}
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 px-0.5">
        {hasMore
          ? `${shown} von ${total} Tankstelle${total !== 1 ? 'n' : ''}`
          : `${total} Tankstelle${total !== 1 ? 'n' : ''} gefunden`}
      </p>

      {recommendations.slice(0, shown).map((rec, idx) => (
        <div
          key={rec.station.id}
          className="animate-fade-in-up"
          style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
        >
          <StationCard
            recommendation={rec}
            marketAvg={marketAvg}
            onStationClick={onStationClick}
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
