// ============================================================
// Station Compare Page — Tankstellen-Vergleich
// ============================================================

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store/app-store';
import { useStationSearch } from '@/lib/hooks/use-stations';
import { useRecommendations } from '@/lib/hooks/use-recommendations';
import { PriceTag } from '@/components/ui/PriceTag';
import { ReachabilityBadge } from '@/components/ui/ReachabilityBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  formatAddress,
  formatDistance,
  formatDriveTime,
  estimateDriveTime,
  AVERAGE_SPEED_KMH,
  computeReachability,
  computeRemainingRange,
} from '@tankpilot/core';
import type { FuelType } from '@tankpilot/core';

export default function ComparePage() {
  const compareIds = useAppStore((s) => s.compareStationIds);
  const toggleCompare = useAppStore((s) => s.toggleCompareStation);
  const clearCompare = useAppStore((s) => s.clearCompare);
  const vehicle = useAppStore((s) => s.vehicle);
  const filter = useAppStore((s) => s.filter);
  const userLocation = useAppStore((s) => s.userLocation);

  const { data: stations } = useStationSearch({
    lat: userLocation?.lat ?? null,
    lng: userLocation?.lng ?? null,
    radiusKm: filter.radiusKm,
    fuelType: filter.fuelType,
  });

  const recommendations = useRecommendations(stations);

  const compared = useMemo(() => {
    return compareIds
      .map((id) => recommendations.find((r) => r.station.id === id))
      .filter(Boolean) as typeof recommendations;
  }, [compareIds, recommendations]);

  const range = vehicle ? computeRemainingRange(vehicle) : null;

  return (
    <div className="max-w-4xl mx-auto p-6 animate-fade-in">
      <Link href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Zur&uuml;ck
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tankstellen-Vergleich</h1>
        {compared.length > 0 && (
          <button type="button" onClick={clearCompare}
            className="text-sm text-red-500 hover:text-red-600">
            Alle entfernen
          </button>
        )}
      </div>

      {compared.length === 0 ? (
        <EmptyState
          title="Keine Tankstellen ausgew&auml;hlt"
          message="W&auml;hle bis zu 3 Tankstellen auf der Karte oder in der Liste zum Vergleichen aus."
        />
      ) : (
        <>
          {/* Compare Grid */}
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${compared.length}, 1fr)` }}>
            {compared.map((rec) => {
              const s = rec.station;
              const address = formatAddress(s.street, s.houseNumber, s.postCode, s.place);
              const driveTime = estimateDriveTime(s.dist, AVERAGE_SPEED_KMH);
              const reachability = computeReachability(s.dist, range);

              return (
                <div key={s.id} className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                        {s.brand || s.name}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{address}</p>
                    </div>
                    <button type="button" onClick={() => toggleCompare(s.id)}
                      className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ml-2 flex-shrink-0">
                      <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className={`w-2 h-2 rounded-full ${s.isOpen ? 'bg-reach-safe' : 'bg-gray-300'}`} />
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {s.isOpen ? 'Ge\u00f6ffnet' : 'Geschlossen'}
                    </span>
                  </div>

                  {/* Prices */}
                  <div className="space-y-2 mb-4">
                    {FUEL_TYPES.map((ft: FuelType) => (
                      <div key={ft} className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">{FUEL_TYPE_LABELS[ft]}</span>
                        <PriceTag price={s.prices[ft]} fuelType={ft} size="sm" />
                      </div>
                    ))}
                  </div>

                  {/* Distance & Time */}
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500 dark:text-gray-400">Entfernung</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">{formatDistance(s.dist)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500 dark:text-gray-400">Fahrzeit</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">~{formatDriveTime(driveTime)}</span>
                    </div>
                    <div className="flex justify-between text-xs items-center">
                      <span className="text-gray-500 dark:text-gray-400">Erreichbarkeit</span>
                      <ReachabilityBadge status={reachability} />
                    </div>
                    {rec.isBestOption && (
                      <div className="bg-brand-50 dark:bg-brand-900/20 text-brand-600 text-xs font-semibold text-center py-1.5 rounded-lg mt-2">
                        Beste Empfehlung
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add more hint */}
          {compared.length < 3 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">
              Du kannst bis zu 3 Tankstellen vergleichen. Noch {3 - compared.length} Platz/Pl&auml;tze frei.
            </p>
          )}
        </>
      )}

      {/* How to add */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl p-4 mt-6">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">So f&uuml;gst du Tankstellen hinzu:</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Tippe auf der Hauptseite auf eine Tankstelle und w&auml;hle &bdquo;Vergleichen&ldquo; &mdash; oder nutze den Button in der Listenansicht.
        </p>
      </div>
    </div>
  );
}
