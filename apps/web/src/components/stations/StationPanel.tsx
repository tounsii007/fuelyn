'use client';

import { useAppStore } from '@/lib/store/app-store';
import { ReachabilityBadge } from '../ui/ReachabilityBadge';
import type { FuelType } from '@fuelyn/core';
import {
  formatAddress,
  formatPrice,
  computeReachability,
  computeRemainingRange,
  FUEL_TYPE_LABELS,
  FUEL_TYPES,
} from '@fuelyn/core';
import { BrandBadge } from '../ui/BrandBadge';

export function StationPanel() {
  const routeTarget = useAppStore((state) => state.routeTarget);
  const activeRoute = useAppStore((state) => state.activeRoute);
  const routeLoading = useAppStore((state) => state.routeLoading);
  const clearRoute = useAppStore((state) => state.clearRoute);
  const fuelType = useAppStore((state) => state.filter.fuelType);
  const vehicle = useAppStore((state) => state.vehicle);
  const isFavorite = useAppStore((state) => (routeTarget ? state.isFavorite(routeTarget.id) : false));
  const addFavorite = useAppStore((state) => state.addFavorite);
  const removeFavorite = useAppStore((state) => state.removeFavorite);

  if (!routeTarget) return null;

  const station = routeTarget;
  const price = station.prices?.[fuelType] ?? null;
  const address = formatAddress(station.street, station.houseNumber, station.postCode, station.place);
  const range = vehicle ? computeRemainingRange(vehicle) : null;
  const reachability = computeReachability(station.dist, range);
  const routeDistanceKm = activeRoute ? activeRoute.distanceMeters / 1000 : station.dist;
  const routeDurationMin = activeRoute
    ? Math.round(activeRoute.durationSeconds / 60)
    : Math.round((station.dist / 40) * 60);

  const handleFavoriteToggle = () => {
    if (isFavorite) {
      removeFavorite(station.id);
      return;
    }

    addFavorite({
      stationId: station.id,
      name: station.name,
      brand: station.brand,
      addedAt: new Date().toISOString(),
    });
  };

  const handleShare = async () => {
    const text = `${station.brand || station.name}\n${address}\n${FUEL_TYPE_LABELS[fuelType]}: ${price != null ? `${formatPrice(price)} \u20ac` : '\u2014'}`;
    const shareData = {
      title: `${station.brand || station.name} \u2014 Fuelyn`,
      text,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        window.prompt('Text zum Teilen kopieren:', text);
      }
    } catch {
      // Ignore user-cancelled shares and clipboard denials.
    }
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[1000] animate-slide-up">
      <div
        className="mx-3 mb-3 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sheet
                   dark:border-gray-700 dark:bg-surface-dark-secondary"
      >
        {routeLoading && (
          <div className="h-1 overflow-hidden bg-gray-100 dark:bg-gray-800">
            <div className="h-full w-full animate-pulse bg-brand-600" />
          </div>
        )}

        <div className="p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <BrandBadge brand={station.brand} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-base font-bold text-gray-900 dark:text-gray-100">
                    {station.brand || station.name}
                  </h3>
                  <span
                    className={`h-2 w-2 flex-shrink-0 rounded-full ${
                      station.isOpen ? 'bg-reach-safe' : 'bg-gray-300'
                    }`}
                  />
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{address}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearRoute}
              className="flex-shrink-0 rounded-lg p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Schließen"
            >
              <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-3 flex items-center gap-2">
            {FUEL_TYPES.map((ft: FuelType) => {
              const stationPrice = station.prices?.[ft];
              const isSelected = ft === fuelType;

              return (
                <div
                  key={ft}
                  className={`flex-1 rounded-lg px-1 py-1.5 text-center transition-colors ${
                    isSelected
                      ? 'bg-brand-50 ring-1 ring-brand-500/30 dark:bg-brand-900/20'
                      : 'bg-gray-50 dark:bg-gray-800/50'
                  }`}
                >
                  <p
                    className={`text-[10px] font-medium ${
                      isSelected ? 'text-brand-600 dark:text-brand-400' : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {FUEL_TYPE_LABELS[ft]}
                  </p>
                  <p
                    className={`text-sm font-bold ${
                      isSelected ? 'text-brand-700 dark:text-brand-300' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {stationPrice != null ? `${formatPrice(stationPrice)} \u20ac` : '\u2014'}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500">Strecke</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {routeDistanceKm < 1 ? `${Math.round(routeDistanceKm * 1000)} m` : `${routeDistanceKm.toFixed(1)} km`}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500">Fahrzeit</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {routeDurationMin < 1 ? '<1 min' : `${routeDurationMin} min`}
                </p>
              </div>
              {vehicle?.tankCapacity && price != null && (
                <div className="text-center">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Volltanken</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {(price * vehicle.tankCapacity).toFixed(2)} \u20ac
                  </p>
                </div>
              )}
              <ReachabilityBadge status={reachability} />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (activeRoute) {
                  useAppStore.getState().startNavigation();
                }
              }}
              disabled={!activeRoute}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm
                         font-semibold text-white shadow-sm transition-colors hover:bg-brand-700
                         active:bg-brand-800 disabled:cursor-wait disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="currentColor" stroke="none" />
              </svg>
              {routeLoading ? 'Route wird geladen...' : 'Navigation starten'}
            </button>
            <button
              type="button"
              onClick={handleFavoriteToggle}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                isFavorite
                  ? 'bg-red-50 text-red-500 dark:bg-red-900/20'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
              }`}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill={isFavorite ? 'currentColor' : 'none'}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
                />
              </svg>
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors
                         hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              aria-label="Teilen"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
