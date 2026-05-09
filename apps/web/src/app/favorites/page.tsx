// ============================================================
// Favorites Page
// ============================================================

'use client';

import Link from 'next/link';
import { useAppStore } from '@/lib/store/app-store';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { IconButton } from '@/components/ui/IconButton';

/**
 * Tankerkönig-style brevity for the "added X ago" subtitle: minutes
 * → hours → days → weeks. Returns "" for unparseable input so the
 * caller can suppress the line entirely.
 */
function relativeAddedAt(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diffSec = Math.max(0, (Date.now() - t) / 1000);
  if (diffSec < 60) return 'gerade eben';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} Min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'gestern';
  if (diffD < 7) return `${diffD} Tagen`;
  const diffW = Math.floor(diffD / 7);
  if (diffW === 1) return '1 Woche';
  if (diffW < 5) return `${diffW} Wochen`;
  const diffMo = Math.floor(diffD / 30);
  return `${diffMo} Monaten`;
}

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
          message={
            <span className="block">
              Tippe auf das Herz-Symbol bei einer Tankstelle, um sie hier zu sehen.
              Favoriten erscheinen auch <strong>oben</strong> in deiner Suchergebnisliste.
            </span>
          }
          action={{
            label: 'Zur Karte',
            onClick: () => { window.location.href = '/'; },
          }}
        />
      ) : (
        <>
          {/*
            Header — count + sort hint. Sets expectations about the
            ordering ("newest first") so a recently-added entry at
            the top reads as intentional, not random.
          */}
          <p className="mb-3 text-xs text-gray-500 dark:text-gray-400 px-1">
            {favorites.length} gespeichert · neueste zuerst
          </p>
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
                  {/*
                    Relative-time hint of when the user added this
                    station — same pattern as SearchHistory chips.
                    Stops the list feeling like an unordered bag.
                  */}
                  {fav.addedAt && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                      seit {relativeAddedAt(fav.addedAt)}
                    </p>
                  )}
                </Link>
                {/*
                  Action rail: open-on-map first, remove second.
                  The order matches what users actually want to do
                  with a favourite — re-visit it. The destructive
                  action sits second and uses the danger tone so a
                  mis-tap is unlikely.
                */}
                <Link
                  href={`/?focusStation=${encodeURIComponent(fav.stationId)}`}
                  className="rounded-xl px-3 py-2 text-xs font-semibold
                             bg-brand-50 text-brand-700 hover:bg-brand-100
                             dark:bg-brand-900/30 dark:text-brand-300 dark:hover:bg-brand-900/50
                             transition-colors"
                  title="Auf der Karte ansehen"
                  aria-label="Auf der Karte ansehen"
                >
                  Karte
                </Link>
                <IconButton
                  tone="danger"
                  size="md"
                  onClick={() => removeFavorite(fav.stationId)}
                  aria-label="Favorit entfernen"
                  title="Aus Favoriten entfernen"
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
        </>
      )}
    </div>
  );
}
