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
} from '@fuelyn/core';
import type { FuelType, StationRecommendation, VehicleProfile } from '@fuelyn/core';

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
        <>
          <EmptyState
            icon="⚖️"
            title="Keine Tankstellen ausgewählt"
            message={
              <span className="block">
                <span className="block mb-3">
                  Wähle bis zu <strong className="text-gray-900 dark:text-gray-100">3 Tankstellen</strong>{' '}
                  zum nebeneinanderstellen — der Vergleich rechnet
                  Preise, Strecke und Sprit-Aufwand für jede aus.
                </span>
              </span>
            }
            action={{
              label: 'Zur Karte',
              onClick: () => { window.location.href = '/'; },
            }}
          />

          {/*
            How-to-add hints. Renders below the empty state so
            users don't have to know the UX cold to be productive
            — three concrete entry points, each with the matching
            icon they'll see in the actual UI.
          */}
          <div className="mt-2 mx-auto max-w-md rounded-2xl bg-gray-50 dark:bg-gray-800/40 p-4 text-sm">
            <p className="font-semibold text-gray-700 dark:text-gray-200 mb-3 text-center">
              So fügst du Tankstellen hinzu:
            </p>
            <ol className="space-y-2 text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-xs font-bold">
                  1
                </span>
                <span>
                  Tippe einen Marker auf der Karte an und nutze den
                  &nbsp;
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-white dark:bg-gray-900 ring-1 ring-gray-200 dark:ring-gray-700 align-text-bottom">
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                  </span>
                  &nbsp;Vergleich-Button im Detail-Panel.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-xs font-bold">
                  2
                </span>
                <span>Oder tippe in der Liste rechts auf das gleiche Vergleichs-Icon.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-xs font-bold">
                  3
                </span>
                <span>
                  Sobald du mindestens eine Tankstelle gewählt hast, erscheint unten ein
                  „Vergleichen"-Button — der bringt dich zurück hierher.
                </span>
              </li>
            </ol>
          </div>
        </>
      ) : (
        <>
          {/*
            Group summary — appears with ≥2 compared stations and
            tells the user what they actually want to know:
              • Spannweite (cheapest vs most expensive of THIS set)
              • Spar-Potenzial pro Tankfüllung (delta × tank size)
              • Markt-Schnitt der ausgewählten Tankstellen
            For one station the comparison has no other side, so
            the strip is suppressed.
          */}
          <CompareGroupSummary compared={compared} fuelType={filter.fuelType} vehicle={vehicle} />

          {/* Compare Grid */}
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: `repeat(${compared.length}, minmax(0, 1fr))` }}
          >
            {(() => {
              // Pre-compute the cheapest active-fuel price across the
              // compared set. Used by the per-card "+ X €/Tank vs.
              // günstigster" footer chip.
              const groupPrices = compared
                .map((r) => r.station.prices?.[filter.fuelType])
                .filter((p): p is number => typeof p === 'number');
              const groupMin = groupPrices.length > 0 ? Math.min(...groupPrices) : null;
              return compared.map((rec) => {
              const s = rec.station;
              const address = formatAddress(s.street, s.houseNumber, s.postCode, s.place);
              const driveTime = estimateDriveTime(s.dist, AVERAGE_SPEED_KMH);
              const reachability = computeReachability(s.dist, range);
              // Per-fill € delta vs the cheapest of the compared
              // set. Suppressed for the cheapest station itself
              // (delta would be 0 € — no signal to add).
              const myPrice = s.prices?.[filter.fuelType];
              const tankL = vehicle?.tankCapacity ?? 50;
              const deltaPerFillEur =
                typeof myPrice === 'number' && groupMin != null && myPrice > groupMin
                  ? (myPrice - groupMin) * tankL
                  : null;

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
                    {/*
                      Per-fill delta vs cheapest of THIS comparison
                      set. Different signal from the overall-market
                      delta on the home cards — here it answers
                      "how much more does picking THIS one cost me
                      vs the cheapest one I chose to compare?".
                    */}
                    {deltaPerFillEur != null && (
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 text-center mt-2 font-semibold">
                        +{deltaPerFillEur.toFixed(2)} € pro Tank vs. günstigster
                      </p>
                    )}
                  </div>
                </article>
              );
            });
            })()}
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

/**
 * Group-summary strip — only renders when at least 2 stations are
 * compared AND at least 2 of them have a price for the active fuel.
 * Three numbers that turn the comparison from a side-by-side card
 * grid into a verdict:
 *   • Spannweite — cheapest vs. most expensive of THIS set (ct).
 *   • Spar-Potenzial — that delta × tank capacity (€).
 *   • Schnitt — arithmetic mean of the visible prices (€/L).
 *
 * Uses the user's vehicle.tankCapacity when available, otherwise
 * falls back to a 50 L default so the savings number is meaningful
 * for casual users without a profile set.
 */
function CompareGroupSummary({
  compared,
  fuelType,
  vehicle,
}: {
  compared: readonly StationRecommendation[];
  fuelType: FuelType;
  vehicle: VehicleProfile | null;
}) {
  const prices = compared
    .map((r) => r.station.prices?.[fuelType])
    .filter((p): p is number => typeof p === 'number');
  if (prices.length < 2) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
  const tankL = vehicle?.tankCapacity ?? 50;
  const savingsPerFill = (max - min) * tankL;

  return (
    <section
      aria-label="Vergleichs-Übersicht"
      className="mb-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700
                 dark:from-brand-700 dark:to-brand-900
                 text-white p-4 shadow-card"
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70 mb-3">
        Vergleichs-Übersicht
      </p>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] text-white/60 uppercase tracking-wide">Spannweite</p>
          <p className="text-xl font-bold tabular-nums">{Math.round((max - min) * 100)} ct</p>
        </div>
        <div>
          <p className="text-[10px] text-white/60 uppercase tracking-wide">Spar-Potenzial</p>
          <p className="text-xl font-bold tabular-nums">{savingsPerFill.toFixed(2)} €</p>
          <p className="text-[9px] text-white/60 mt-0.5">pro {Math.round(tankL)} L Tank</p>
        </div>
        <div>
          <p className="text-[10px] text-white/60 uppercase tracking-wide">Schnitt</p>
          <p className="text-xl font-bold tabular-nums">{avg.toFixed(3)} €</p>
        </div>
      </div>
    </section>
  );
}
