// ============================================================
// Favorites Page
// ============================================================

'use client';

import Link from 'next/link';
import { useAppStore } from '@/lib/store/app-store';
import { EmptyState } from '@/components/ui/EmptyState';

export default function FavoritesPage() {
  const favorites = useAppStore((s) => s.favorites);
  const removeFavorite = useAppStore((s) => s.removeFavorite);

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade-in">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Zurück
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        Favoriten
      </h1>

      {favorites.length === 0 ? (
        <EmptyState
          icon="❤️"
          title="Noch keine Favoriten"
          message="Tippe auf das Herz-Symbol bei einer Tankstelle, um sie als Favorit zu speichern."
        />
      ) : (
        <div className="space-y-3">
          {favorites.map((fav) => (
            <div
              key={fav.stationId}
              className="flex items-center justify-between p-4 bg-white dark:bg-surface-dark-secondary
                         rounded-2xl shadow-card"
            >
              <Link href={`/station/${fav.stationId}`} className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {fav.brand || fav.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {fav.name}
                </p>
              </Link>
              <button
                type="button"
                onClick={() => removeFavorite(fav.stationId)}
                className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ml-3"
                aria-label="Favorit entfernen"
              >
                <svg className="w-5 h-5 text-red-500 fill-red-500" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
