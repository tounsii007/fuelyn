// ============================================================
// Skeleton — Loading placeholder
// ============================================================

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-skeleton bg-gray-200 dark:bg-gray-700 rounded-lg ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}

export function StationCardSkeleton() {
  return (
    <div className="p-4 rounded-2xl bg-white dark:bg-surface-dark-secondary shadow-card">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <Skeleton className="h-5 w-36 mb-2" />
          <Skeleton className="h-4 w-48 mb-1" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="flex items-center gap-3 mt-3">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-5 w-24" />
      </div>
    </div>
  );
}
