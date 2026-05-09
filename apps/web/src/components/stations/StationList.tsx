// ============================================================
// StationList -- Scrollable list of station cards with
// incremental "load more" pagination to avoid rendering
// hundreds of cards at once.
// ============================================================

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { StationRecommendation } from '@fuelyn/core';
import { StationCard } from './StationCard';
import { StationCardSkeleton } from '../ui/Skeleton';
import { EmptyState } from '../ui/EmptyState';

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
      {/* Result count */}
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
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
            onClick={() => onStationClick(rec.station.id)}
          />
        </div>
      ))}

      {/* Load more button */}
      {hasMore && (
        <button
          ref={loadMoreRef}
          type="button"
          onClick={handleLoadMore}
          className="mt-2 w-full py-3 text-sm font-semibold text-brand-600 dark:text-brand-400
                     bg-brand-50 dark:bg-brand-900/20 rounded-2xl
                     hover:bg-brand-100 dark:hover:bg-brand-900/30
                     active:scale-[0.98] transition-all duration-150"
        >
          Mehr laden ({total - shown} weitere)
        </button>
      )}
    </div>
  );
}
