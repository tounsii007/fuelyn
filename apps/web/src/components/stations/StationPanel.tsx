'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { ReachabilityBadge } from '../ui/ReachabilityBadge';
import type { FuelType, StationRecommendation } from '@fuelyn/core';
import {
  AVERAGE_SPEED_KMH,
  estimateDriveTime,
  formatAddress,
  formatDistance,
  formatDriveTime,
  formatPrice,
  computeReachability,
  computeRemainingRange,
  FUEL_TYPE_LABELS,
  FUEL_TYPES,
} from '@fuelyn/core';
import { BrandBadge } from '../ui/BrandBadge';

interface StationPanelProps {
  /**
   * Current set of recommended stations. Used to contextualise the
   * panel's prices ("−5 ct vs. Markt", "günstigster der Liste") and
   * to highlight the best deal. Optional — when omitted (e.g. a
   * deep-link station with no other context), the contextual chips
   * are simply suppressed.
   */
  readonly recommendations?: readonly StationRecommendation[];
}

/**
 * Per-fuel market context derived from the candidate set.
 *   • min  → cheapest price across stations for the fuel
 *   • avg  → arithmetic mean (used for the ±ct chip)
 *   • count→ number of stations contributing (chip suppresses
 *            below 3 because comparing against 1–2 samples is
 *            misleading more than informative)
 */
type MarketStat = { readonly min: number; readonly avg: number; readonly count: number };
type MarketStats = Partial<Record<FuelType, MarketStat>>;

function computeMarketStats(recs: readonly StationRecommendation[] | undefined): MarketStats {
  if (!recs || recs.length === 0) return {};
  const stats: MarketStats = {};
  for (const fuel of FUEL_TYPES) {
    const prices: number[] = [];
    for (const r of recs) {
      const p = r.station.prices?.[fuel];
      if (typeof p === 'number' && p > 0) prices.push(p);
    }
    if (prices.length === 0) continue;
    const min = Math.min(...prices);
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    stats[fuel] = { min, avg, count: prices.length };
  }
  return stats;
}

export function StationPanel({ recommendations }: StationPanelProps = {}) {
  const routeTarget = useAppStore((state) => state.routeTarget);
  const activeRoute = useAppStore((state) => state.activeRoute);
  const routeLoading = useAppStore((state) => state.routeLoading);
  const clearRoute = useAppStore((state) => state.clearRoute);
  const fuelType = useAppStore((state) => state.filter.fuelType);
  const vehicle = useAppStore((state) => state.vehicle);
  const isFavorite = useAppStore((state) => (routeTarget ? state.isFavorite(routeTarget.id) : false));
  const addFavorite = useAppStore((state) => state.addFavorite);
  const removeFavorite = useAppStore((state) => state.removeFavorite);

  // Market context derived from the candidate set. Memoised because
  // computeMarketStats walks every fuel × every station.
  const marketStats = useMemo(() => computeMarketStats(recommendations), [recommendations]);

  if (!routeTarget) return null;

  const station = routeTarget;
  const price = station.prices?.[fuelType] ?? null;
  const address = formatAddress(station.street, station.houseNumber, station.postCode, station.place);
  const range = vehicle ? computeRemainingRange(vehicle) : null;
  const reachability = computeReachability(station.dist, range);

  // ─── Distance / Time — keep the SAME metrics as the list card ────
  // The list card shows airline distance (`station.dist` from
  // Tankerkönig) and a 50 km/h heuristic drive time. The panel used
  // to swap to the routing service's road distance + real drive
  // time as soon as the route loaded — different numbers for the
  // same station, which made users think they'd clicked the wrong
  // entry. We now mirror the card here and surface the route as a
  // *secondary* line so power users still see the precise nav
  // estimate without it overriding the "headline" numbers.
  const airlineDistanceKm = station.dist;
  const heuristicDriveMin = estimateDriveTime(station.dist, AVERAGE_SPEED_KMH);
  const routeDistanceKm = activeRoute ? activeRoute.distanceMeters / 1000 : null;
  const routeDurationMin = activeRoute
    ? Math.round(activeRoute.durationSeconds / 60)
    : null;
  // Show the route line only when it differs by at least 10 % from the
  // heuristic; otherwise it's just clutter.
  const routeMeaningfullyDifferent =
    routeDistanceKm != null && routeDurationMin != null &&
    (Math.abs(routeDistanceKm - airlineDistanceKm) / Math.max(airlineDistanceKm, 0.1) > 0.1 ||
     Math.abs(routeDurationMin - heuristicDriveMin) / Math.max(heuristicDriveMin, 1) > 0.1);

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
    const text = `${station.brand || station.name}\n${address}\n${FUEL_TYPE_LABELS[fuelType]}: ${price != null ? `${formatPrice(price)} €` : '—'}`;
    const shareData = {
      title: `${station.brand || station.name} — Fuelyn`,
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
                    title={station.isOpen ? 'Geöffnet' : 'Geschlossen'}
                  />
                </div>
                {/*
                  Address is the only reliable disambiguator when the
                  same brand has multiple stations in the area (e.g.
                  two "Raiffeisen" within 40 km). Bumped from xs to
                  sm + medium-weight so users can tell at a glance
                  *which* Aral / Raiffeisen / Shell they're looking at.
                */}
                <p className="mt-0.5 truncate text-sm font-medium text-gray-700 dark:text-gray-300">
                  {address}
                </p>
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
              const stat = marketStats[ft];

              // Compute the ±ct delta vs. the candidate-set mean.
              // Suppressed when:
              //   • we have no station price (nothing to compare),
              //   • we have no market stats (no candidate set),
              //   • the candidate set is too small to be informative
              //     (count < 3 — comparing against 1–2 values is
              //     statistically meaningless and misleading UX).
              let deltaCt: number | null = null;
              let isCheapest = false;
              if (stationPrice != null && stat && stat.count >= 3) {
                deltaCt = Math.round((stationPrice - stat.avg) * 100);
                isCheapest = stationPrice <= stat.min + 0.0005;
              }

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
                    {stationPrice != null ? `${formatPrice(stationPrice)} €` : '—'}
                  </p>
                  {/*
                    Market context chip — fed by the candidate set
                    that's currently visible in the right panel. Two
                    visual states:
                      green   → ≥1 ct cheaper than the average
                      red     → ≥1 ct more expensive
                      neutral → within ±1 ct (suppressed entirely
                                so the row stays compact)
                    A separate "günstigster" chip wins over the
                    delta when this station IS the cheapest in the
                    set — that's a stronger signal than "−5 ct".
                  */}
                  {isCheapest ? (
                    <span
                      className="mt-0.5 inline-flex items-center gap-0.5 rounded-full px-1.5
                                 text-[9px] font-semibold leading-tight
                                 bg-emerald-100 text-emerald-700
                                 dark:bg-emerald-900/40 dark:text-emerald-300"
                      title={`Günstigster ${FUEL_TYPE_LABELS[ft]}-Preis in der aktuellen Liste`}
                    >
                      ★ günstigster
                    </span>
                  ) : deltaCt !== null && Math.abs(deltaCt) >= 1 ? (
                    <span
                      className={`mt-0.5 inline-flex items-center rounded-full px-1.5
                                  text-[9px] font-semibold leading-tight ${
                                    deltaCt < 0
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                                      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                                  }`}
                      title={`${Math.abs(deltaCt)} ct ${deltaCt < 0 ? 'unter' : 'über'} dem Schnitt der angezeigten Tankstellen`}
                    >
                      {deltaCt > 0 ? '+' : ''}
                      {deltaCt} ct
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-sm">
              <div className="text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500">Strecke</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatDistance(airlineDistanceKm)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 dark:text-gray-500">Fahrzeit</p>
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  ~{formatDriveTime(heuristicDriveMin)}
                </p>
              </div>
              {vehicle?.tankCapacity && price != null && (
                <div className="text-center">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Volltanken</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100">
                    {(price * vehicle.tankCapacity).toFixed(2)} €
                  </p>
                </div>
              )}
              <ReachabilityBadge status={reachability} />
            </div>
          </div>

          {/*
            Route detail — secondary line, only shown when the actual
            road route differs noticeably from the airline heuristic
            (typically: detours, ferries, dense city blocks). Keeps
            the headline strecke/fahrzeit values aligned with the
            list card so users don't get whiplash from clicking.
          */}
          {routeMeaningfullyDifferent && routeDistanceKm != null && routeDurationMin != null && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-1.5
                            text-xs text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
              <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m-6 3l6-3" />
              </svg>
              <span>
                Route:&nbsp;
                <span className="font-medium text-gray-700 dark:text-gray-200">
                  {formatDistance(routeDistanceKm)}
                </span>
                &nbsp;·&nbsp;
                <span className="font-medium text-gray-700 dark:text-gray-200">
                  {routeDurationMin < 1 ? '<1 min' : `${routeDurationMin} min`}
                </span>
              </span>
            </div>
          )}

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
