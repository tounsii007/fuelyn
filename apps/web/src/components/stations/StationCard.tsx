// ============================================================
// StationCard — Rich station card for list and detail views
// ============================================================

'use client';

import type { StationRecommendation } from '@fuelyn/core';
import { formatDistance, formatDriveTime, formatAddress } from '@fuelyn/core';
import { PriceTag } from '../ui/PriceTag';
import { ReachabilityBadge } from '../ui/ReachabilityBadge';
import { BrandBadge } from '../ui/BrandBadge';
import { useAppStore } from '@/lib/store/app-store';

interface StationCardProps {
  recommendation: StationRecommendation;
  onClick?: () => void;
}

export function StationCard({ recommendation, onClick }: StationCardProps) {
  const { station, reachabilityStatus, estimatedDriveTime, isBestOption, reasons } =
    recommendation;
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const isFavorite = useAppStore((s) => s.isFavorite(station.id));
  const addFavorite = useAppStore((s) => s.addFavorite);
  const removeFavorite = useAppStore((s) => s.removeFavorite);
  const compareIds = useAppStore((s) => s.compareStationIds);
  const toggleCompare = useAppStore((s) => s.toggleCompareStation);
  const isCompared = compareIds.includes(station.id);

  const address = formatAddress(station.street, station.houseNumber, station.postCode, station.place);
  const price = station.prices?.[fuelType] ?? null;

  const handleFavoriteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFavorite) {
      removeFavorite(station.id);
    } else {
      addFavorite({
        stationId: station.id,
        name: station.name,
        brand: station.brand,
        addedAt: new Date().toISOString(),
      });
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick?.(); }}
      className={`w-full text-left p-4 rounded-2xl transition-all duration-200 cursor-pointer
        bg-white dark:bg-surface-dark-secondary
        shadow-card hover:shadow-card-hover active:shadow-card-active
        ${isBestOption ? 'ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-surface-dark' : ''}
        animate-fade-in group`}
    >
      {/* Best Option Badge */}
      {isBestOption && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-600 text-white">
            Beste Option
          </span>
        </div>
      )}

      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <BrandBadge brand={station.brand} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {station.brand || station.name}
              </h3>
              <span
                className={`flex-shrink-0 w-2 h-2 rounded-full ${
                  station.isOpen ? 'bg-reach-safe' : 'bg-gray-300 dark:bg-gray-600'
                }`}
                title={station.isOpen ? 'Geöffnet' : 'Geschlossen'}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {address}
            </p>
          </div>
        </div>

        {/* Price */}
        <PriceTag price={price} fuelType={fuelType} size="md" />
      </div>

      {/* Meta Row */}
      <div className="flex items-center flex-wrap gap-2 mt-3">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatDistance(station.dist)}
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          ~{formatDriveTime(estimatedDriveTime)}
        </span>

        {reachabilityStatus !== 'safe' && (
          <ReachabilityBadge status={reachabilityStatus} />
        )}

        {/* Compare button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleCompare(station.id); }}
          className={`ml-auto p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
            isCompared ? 'text-brand-600' : 'text-gray-300 dark:text-gray-600 group-hover:text-gray-400'
          }`}
          aria-label={isCompared ? 'Aus Vergleich entfernen' : 'Zum Vergleich hinzufügen'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </button>

        {/* Favorite button */}
        <button
          type="button"
          onClick={handleFavoriteToggle}
          className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label={isFavorite ? 'Favorit entfernen' : 'Als Favorit speichern'}
        >
          <svg
            className={`w-5 h-5 transition-colors ${
              isFavorite
                ? 'text-red-500 fill-red-500'
                : 'text-gray-300 dark:text-gray-600 group-hover:text-gray-400'
            }`}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            fill={isFavorite ? 'currentColor' : 'none'}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
            />
          </svg>
        </button>
      </div>

      {/* Reasons */}
      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {reasons.slice(0, 3).map((reason) => (
            <span
              key={reason}
              className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
            >
              {reason}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
