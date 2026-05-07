// ============================================================
// Favorites Page
// ============================================================

'use client';

import Link from 'next/link';
import { useAppStore } from '@/lib/store/app-store';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { IconButton } from '@/components/ui/IconButton';

export default function FavoritesPage() {
  const favorites = useAppStore((s) => s.favorites);
  const removeFavorite = useAppStore((s) => s.removeFavorite);

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade-in">
      <PageHeader title="Favoriten" />

      {favorites.length === 0 ? (
        <EmptyState
          icon="❤️"
          title="Noch keine Favoriten"
          message="Tippe auf das Herz-Symbol bei einer Tankstelle, um sie als Favorit zu speichern."
        />
      ) : (
        <ul className="space-y-3">
          {favorites.map((fav) => (
            <li
              key={fav.stationId}
              className="flex items-center justify-between gap-3 p-4
                         bg-white dark:bg-gray-800/90
                         border border-gray-100 dark:border-gray-700/60
                         rounded-2xl shadow-card transition-shadow
                         hover:shadow-card-hover"
            >
              <Link
                href={`/station/${fav.stationId}`}
                className="flex-1 min-w-0 -my-2 -ml-2 py-2 pl-2 pr-3 rounded-xl
                           focus-visible:outline-none focus-visible:ring-2
                           focus-visible:ring-brand-500/40 focus-visible:ring-offset-2
                           focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900
                           hover:bg-gray-50/60 dark:hover:bg-gray-700/40 transition-colors"
              >
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {fav.brand || fav.name}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{fav.name}</p>
              </Link>
              <IconButton
                tone="danger"
                size="md"
                onClick={() => removeFavorite(fav.stationId)}
                aria-label="Favorit entfernen"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                  />
                </svg>
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
