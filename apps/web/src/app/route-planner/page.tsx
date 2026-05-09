// ============================================================
// Multi-Stop Route Planner — Routenplaner
//
// Helps the user plan a tour with one or more fuel stops in
// between. Three blocks stacked:
//
//   1) Trip-summary strip — total air-distance, ETA at the
//      vehicle's average speed, projected fuel cost using the
//      cheapest stop on the route.
//   2) Route timeline — start → station → station → … with
//      reorder up/down arrows and a remove button per stop.
//   3) Available stations list — top 10 cheapest in the wider
//      25 km radius, one tap to add to the route.
// ============================================================

'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store/app-store';
import { useStationSearch } from '@/lib/hooks/use-stations';
import { useRecommendations } from '@/lib/hooks/use-recommendations';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  AVERAGE_SPEED_KMH,
  estimateDriveTime,
  FUEL_TYPE_LABELS,
  formatDistance,
  formatDriveTime,
  formatPrice,
} from '@fuelyn/core';

interface RouteStop {
  id: string;
  type: 'start' | 'station' | 'end';
  label: string;
  lat: number;
  lng: number;
  price?: number | null;
}

/** Haversine air-distance in km between two lat/lng points. */
function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLng / 2);
  const h = sin1 * sin1 + Math.cos(lat1) * Math.cos(lat2) * sin2 * sin2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function RoutePlannerPage() {
  const userLocation = useAppStore((s) => s.userLocation);
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const filter = useAppStore((s) => s.filter);
  const vehicle = useAppStore((s) => s.vehicle);

  const { data: stations } = useStationSearch({
    lat: userLocation?.lat ?? null,
    lng: userLocation?.lng ?? null,
    radiusKm: 25,
    fuelType: filter.fuelType,
  });

  const recommendations = useRecommendations(stations);

  const [stops, setStops] = useState<RouteStop[]>(() => {
    if (userLocation) {
      return [{ id: 'start', type: 'start', label: 'Mein Standort', lat: userLocation.lat, lng: userLocation.lng }];
    }
    return [];
  });

  const availableStations = useMemo(() => {
    const stopIds = new Set(stops.map((s) => s.id));
    return recommendations
      .filter((r) => !stopIds.has(r.station.id))
      .sort((a, b) => (a.station.prices?.[fuelType] ?? 99) - (b.station.prices?.[fuelType] ?? 99))
      .slice(0, 10);
  }, [recommendations, stops, fuelType]);

  const addStation = useCallback((stationId: string) => {
    const rec = recommendations.find((r) => r.station.id === stationId);
    if (!rec) return;
    const s = rec.station;
    setStops((prev) => [
      ...prev,
      {
        id: s.id,
        type: 'station',
        label: s.brand || s.name,
        lat: s.lat,
        lng: s.lng,
        price: s.prices[fuelType],
      },
    ]);
  }, [recommendations, fuelType]);

  const removeStop = useCallback((id: string) => {
    setStops((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /**
   * Reorder a stop in the timeline. We deliberately keep the
   * 'start' stop pinned to position 0 so reorder can never put a
   * station BEFORE the user's current location, which would
   * produce nonsense ETA numbers.
   */
  const moveStop = useCallback((id: string, dir: -1 | 1) => {
    setStops((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 1 || target >= prev.length) return prev;
      // Don't displace the start stop.
      if (prev[target]?.type === 'start') return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target]!, next[idx]!];
      return next;
    });
  }, []);

  /**
   * Aggregate trip estimates. Uses straight-line distance between
   * consecutive stops as a baseline (no routing API hit per
   * leg — would explode at 5+ stops); ETA is the sum of legs at
   * AVERAGE_SPEED_KMH; fuel cost picks the cheapest stop's price
   * × the consumption × total km. All values are honest about
   * being approximations.
   */
  const summary = useMemo(() => {
    if (stops.length < 2) return null;
    let totalKm = 0;
    for (let i = 1; i < stops.length; i++) {
      totalKm += distanceKm(stops[i - 1]!, stops[i]!);
    }
    const totalMin = estimateDriveTime(totalKm, AVERAGE_SPEED_KMH);
    const stationStops = stops.filter((s) => s.type === 'station' && s.price != null);
    const cheapestPrice = stationStops.length
      ? stationStops.reduce((min, s) => (s.price! < min ? s.price! : min), Infinity)
      : null;
    // Fuel cost assumes the user fills with the cheapest stop's
    // price for the total trip distance; falls back to 6 L/100km
    // when no vehicle profile is set so the number is still
    // meaningful for casual users.
    const consumption = vehicle?.consumption ?? 6;
    const fuelCost =
      cheapestPrice != null
        ? ((totalKm * consumption) / 100) * cheapestPrice
        : null;
    return {
      totalKm,
      totalMin,
      cheapestPrice,
      fuelCost,
      consumption,
      stops: stops.length,
    };
  }, [stops, vehicle]);

  /** Build a Google-Maps directions URL with all stops as way-points. */
  const externalNavUrl = useMemo(() => {
    if (stops.length < 2) return null;
    const origin = `${stops[0]!.lat},${stops[0]!.lng}`;
    const destination = `${stops[stops.length - 1]!.lat},${stops[stops.length - 1]!.lng}`;
    const waypoints = stops
      .slice(1, -1)
      .map((s) => `${s.lat},${s.lng}`)
      .join('|');
    const params = new URLSearchParams({
      api: '1',
      origin,
      destination,
      travelmode: 'driving',
    });
    if (waypoints) params.set('waypoints', waypoints);
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }, [stops]);

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

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Routenplaner</h1>

      {!userLocation ? (
        <EmptyState
          title="Standort benötigt"
          message="Aktiviere den Standort auf der Hauptseite, um den Routenplaner zu nutzen."
          action={{ label: 'Zur Karte', onClick: () => { window.location.href = '/'; } }}
        />
      ) : (
        <div className="space-y-4">
          {/*
            Trip-summary strip — appears as soon as the user has
            added at least one stop beyond the starting point. Three
            metrics that turn the route into something concrete:
            Strecke (air-distance), Fahrzeit (heuristic), Sprit-
            Kosten (cheapest stop × consumption × total km).
          */}
          {summary && (
            <div className="bg-gradient-to-br from-brand-600 to-brand-700 dark:from-brand-700 dark:to-brand-900
                            rounded-2xl shadow-card p-5 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70 mb-3">
                Routen-Übersicht
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-white/60 uppercase tracking-wide">Strecke</p>
                  <p className="text-xl font-bold tabular-nums">{summary.totalKm.toFixed(1)} km</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/60 uppercase tracking-wide">Fahrzeit</p>
                  <p className="text-xl font-bold tabular-nums">~{formatDriveTime(summary.totalMin)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/60 uppercase tracking-wide">Sprit-Kosten</p>
                  <p className="text-xl font-bold tabular-nums">
                    {summary.fuelCost != null ? `${summary.fuelCost.toFixed(2)} €` : '—'}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[10px] text-white/60">
                Geschätzt mit {summary.consumption.toFixed(1)} L/100 km
                {summary.cheapestPrice != null && (
                  <>
                    {' · günstigster Stopp: '}
                    {formatPrice(summary.cheapestPrice)} €/L
                  </>
                )}
              </p>
              {externalNavUrl && (
                <a
                  href={externalNavUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 rounded-xl
                             bg-white/15 hover:bg-white/25 transition-colors
                             py-2.5 text-sm font-semibold"
                >
                  In Google Maps öffnen
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </a>
              )}
            </div>
          )}

          {/* Route Stops timeline */}
          <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Deine Route</h2>

            {stops.length === 0 ? (
              <p className="text-sm text-gray-400">Keine Stopps geplant.</p>
            ) : (
              <div className="space-y-0">
                {stops.map((stop, idx) => {
                  // Distance to NEXT stop, shown along the timeline
                  // line so users can read each leg without doing
                  // mental arithmetic.
                  const next = stops[idx + 1];
                  const legKm = next ? distanceKm(stop, next) : null;
                  return (
                    <div key={stop.id} className="flex items-start gap-3">
                      {/* Timeline rail */}
                      <div className="flex flex-col items-center pt-2">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                          stop.type === 'start' ? 'bg-brand-600' :
                          stop.type === 'end' ? 'bg-red-500' : 'bg-emerald-500'
                        }`} />
                        {idx < stops.length - 1 && (
                          <div className="relative w-0.5 flex-1 min-h-[40px] bg-gray-200 dark:bg-gray-700">
                            {legKm != null && (
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px]
                                             text-gray-400 dark:text-gray-500 whitespace-nowrap font-medium">
                                {legKm.toFixed(1)} km
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 flex items-center justify-between py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {stop.label}
                          </p>
                          {stop.price != null && (
                            <p className="text-xs text-gray-500">
                              {FUEL_TYPE_LABELS[fuelType]}: {formatPrice(stop.price)} €
                            </p>
                          )}
                        </div>
                        {/* Reorder + remove controls — only on
                            non-start stops so the user's location
                            stays anchored to position 0. */}
                        {stop.type !== 'start' && (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveStop(stop.id, -1)}
                              disabled={idx <= 1}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label="Nach oben"
                              title="Nach oben"
                            >
                              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => moveStop(stop.id, 1)}
                              disabled={idx >= stops.length - 1}
                              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                              aria-label="Nach unten"
                              title="Nach unten"
                            >
                              <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeStop(stop.id)}
                              className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/20 text-gray-400 hover:text-rose-500"
                              aria-label="Stopp entfernen"
                              title="Stopp entfernen"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Available Stations to add */}
          <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              Günstige Tankstellen ({FUEL_TYPE_LABELS[fuelType]})
            </h2>
            {availableStations.length === 0 ? (
              <p className="text-sm text-gray-400">Keine Tankstellen gefunden.</p>
            ) : (
              <div className="space-y-2">
                {availableStations.map((rec) => {
                  const s = rec.station;
                  const price = s.prices[fuelType];
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => addStation(s.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl text-left
                                 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.isOpen ? 'bg-reach-safe' : 'bg-gray-300'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {s.brand || s.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatDistance(s.dist)}</p>
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {price != null ? `${formatPrice(price)} €` : '—'}
                      </span>
                      <svg className="w-4 h-4 text-brand-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
