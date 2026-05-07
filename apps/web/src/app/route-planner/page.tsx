// ============================================================
// Multi-Stop Route Planner — Routenplaner
// ============================================================

'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store/app-store';
import { useStationSearch } from '@/lib/hooks/use-stations';
import { useRecommendations } from '@/lib/hooks/use-recommendations';
import { EmptyState } from '@/components/ui/EmptyState';
import { FUEL_TYPE_LABELS, formatDistance, formatPrice } from '@tankpilot/core';

interface RouteStop {
  id: string;
  type: 'start' | 'station' | 'end';
  label: string;
  lat: number;
  lng: number;
  price?: number | null;
}

export default function RoutePlannerPage() {
  const userLocation = useAppStore((s) => s.userLocation);
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const filter = useAppStore((s) => s.filter);

  const { data: stations } = useStationSearch({
    lat: userLocation?.lat ?? null,
    lng: userLocation?.lng ?? null,
    radiusKm: 25, // wider radius for route planning
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

  const totalEstimate = useMemo(() => {
    const stationStops = stops.filter((s) => s.type === 'station' && s.price != null);
    if (stationStops.length === 0) return null;
    const cheapest = stationStops.reduce((min, s) => {
      if (s.price == null) return min;
      return s.price < min ? s.price : min;
    }, Infinity);
    return cheapest;
  }, [stops]);

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade-in">
      <Link href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Zur&uuml;ck
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Routenplaner</h1>

      {!userLocation ? (
        <EmptyState
          title="Standort ben&ouml;tigt"
          message="Aktiviere den Standort auf der Hauptseite, um den Routenplaner zu nutzen."
        />
      ) : (
        <div className="space-y-4">
          {/* Route Stops */}
          <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Deine Route</h2>

            {stops.length === 0 ? (
              <p className="text-sm text-gray-400">Keine Stopps geplant.</p>
            ) : (
              <div className="space-y-0">
                {stops.map((stop, idx) => (
                  <div key={stop.id} className="flex items-center gap-3">
                    {/* Timeline */}
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                        stop.type === 'start' ? 'bg-brand-600' :
                        stop.type === 'end' ? 'bg-red-500' : 'bg-green-500'
                      }`} />
                      {idx < stops.length - 1 && (
                        <div className="w-0.5 h-8 bg-gray-200 dark:bg-gray-700" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{stop.label}</p>
                        {stop.price != null && (
                          <p className="text-xs text-gray-500">
                            {FUEL_TYPE_LABELS[fuelType]}: {formatPrice(stop.price)} &euro;
                          </p>
                        )}
                      </div>
                      {stop.type !== 'start' && (
                        <button type="button" onClick={() => removeStop(stop.id)}
                          className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                          <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {totalEstimate != null && (
              <div className="mt-4 bg-brand-50 dark:bg-brand-900/20 rounded-xl p-3 text-center">
                <span className="text-xs text-brand-600/70">G&uuml;nstigster Stopp: </span>
                <span className="text-lg font-bold text-brand-700 dark:text-brand-300">
                  {formatPrice(totalEstimate)} &euro;/L
                </span>
              </div>
            )}
          </div>

          {/* Available Stations */}
          <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
              G&uuml;nstige Tankstellen ({FUEL_TYPE_LABELS[fuelType]})
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
                        {price != null ? `${formatPrice(price)} \u20ac` : '\u2014'}
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
