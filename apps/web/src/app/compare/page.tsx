// ============================================================
// Station Compare Page — Tankstellen-Vergleich
// ============================================================

'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useStationSearch } from '@/lib/hooks/use-stations';
import { useRecommendations } from '@/lib/hooks/use-recommendations';
import { PriceTag } from '@/components/ui/PriceTag';
import { ReachabilityBadge } from '@/components/ui/ReachabilityBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { IconButton } from '@/components/ui/IconButton';
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
      <PageHeader
        title="Tankstellen-Vergleich"
        action={
          compared.length > 0 && (
            <button
              type="button"
              onClick={clearCompare}
              className="text-sm font-medium text-red-600 hover:text-red-700
                         dark:text-red-400 dark:hover:text-red-300
                         focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-red-500/40 rounded-md px-2 py-1
                         transition-colors"
            >
              Alle entfernen
            </button>
          )
        }
      />

      {compared.length === 0 ? (
        <EmptyState
          title="Keine Tankstellen ausgewählt"
          message="Wähle bis zu 3 Tankstellen auf der Karte oder in der Liste zum Vergleichen aus."
        />
      ) : (
        <>
          {/* Compare Grid */}
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${compared.length}, minmax(0, 1fr))` }}
          >
            {compared.map((rec) => {
              const s = rec.station;
              const address = formatAddress(s.street, s.houseNumber, s.postCode, s.place);
              const driveTime = estimateDriveTime(s.dist, AVERAGE_SPEED_KMH);
              const reachability = computeReachability(s.dist, range);

              return (
                <article
                  key={s.id}
                  className="bg-white dark:bg-gray-800/90 rounded-2xl shadow-card
                             border border-gray-100 dark:border-gray-700/60
                             p-5 transition-shadow hover:shadow-card-hover"
                >
                  {/* Header */}
                  <header className="flex items-start justify-between gap-2 mb-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">
                        {s.brand || s.name}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                        {address}
                      </p>
                    </div>
                    <IconButton
                      size="sm"
                      onClick={() => toggleCompare(s.id)}
                      aria-label="Aus Vergleich entfernen"
                    >
                      <svg
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </IconButton>
                  </header>

                  {/* Status */}
                  <div className="flex items-center gap-2 mb-4">
                    <span
                      className={`w-2 h-2 rounded-full ${s.isOpen ? 'bg-reach-safe' : 'bg-gray-300 dark:bg-gray-600'}`}
                      aria-hidden="true"
                    />
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                      {s.isOpen ? 'Geöffnet' : 'Geschlossen'}
                    </span>
                  </div>

                  {/* Prices */}
                  <dl className="space-y-2 mb-4">
                    {FUEL_TYPES.map((ft: FuelType) => (
                      <div key={ft} className="flex items-center justify-between">
                        <dt className="text-xs text-gray-500 dark:text-gray-400">
                          {FUEL_TYPE_LABELS[ft]}
                        </dt>
                        <dd>
                          <PriceTag price={s.prices[ft]} fuelType={ft} size="sm" />
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {/* Distance & Time */}
                  <div className="border-t border-gray-100 dark:border-gray-700/60 pt-3 space-y-2">
                    <Row label="Entfernung" value={formatDistance(s.dist)} />
                    <Row label="Fahrzeit" value={`~${formatDriveTime(driveTime)}`} />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 dark:text-gray-400">Erreichbarkeit</span>
                      <ReachabilityBadge status={reachability} />
                    </div>
                    {rec.isBestOption && (
                      <div
                        className="bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-200
                                   text-xs font-semibold text-center py-1.5 rounded-lg mt-2"
                      >
                        Beste Empfehlung
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Add more hint */}
          {compared.length < 3 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 text-center">
              Du kannst bis zu 3 Tankstellen vergleichen. Noch {3 - compared.length} Platz/Plätze
              frei.
            </p>
          )}
        </>
      )}

      {/* How to add */}
      <aside className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-4 mt-6 border border-gray-100 dark:border-gray-700/60">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-2">
          So fügst du Tankstellen hinzu:
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Tippe auf der Hauptseite auf eine Tankstelle und wähle „Vergleichen" — oder nutze den
          Button in der Listenansicht.
        </p>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium tabular-nums text-gray-900 dark:text-gray-100">{value}</span>
    </div>
  );
}
