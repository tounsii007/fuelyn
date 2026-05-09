// ============================================================
// Skeleton — Loading placeholder with shimmer
//
// The previous implementation faded opacity 0.5 ↔ 1.0 — visually
// fine but feels static next to modern apps (Linear/Stripe/Notion)
// where the placeholder has a horizontal gradient sweep. The
// `fy-shimmer` class (defined in globals.css) animates a 200%-wide
// linear gradient across the element so it actually reads as
// "loading" rather than "blinking grey".
// ============================================================

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`fy-shimmer rounded-lg ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function StationCardSkeleton() {
  return (
    <div className="px-3 py-2.5 rounded-2xl bg-white dark:bg-surface-dark-secondary shadow-card
                    border border-gray-100 dark:border-gray-700/60">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Skeleton className="h-9 w-9 rounded-xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <Skeleton className="h-3.5 w-28 mb-1.5" />
            <Skeleton className="h-2.5 w-44" />
          </div>
        </div>
        <Skeleton className="h-7 w-16 flex-shrink-0" />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-1 rounded-full" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}
