// ============================================================
// Station Compare Page — premium-grade Tankstellen-Vergleich.
//
// Design moves:
//   • Hero panel calls the overall winner for the user's
//     selected fuel type (most savings × reachability).
//   • Per-fuel "Bester Preis" badge with green tint on the
//     cheapest cell of every row, and a delta hint on the
//     others (− 0,02 €/L).
//   • Visual savings bar on each card based on a 50 L fill —
//     turns abstract cents into a euros-saved feeling.
//   • Cards reuse the glass-morphic surface used elsewhere
//     (translucent over a subtle gradient) for cohesion with
//     the StationCard / AIInsightsHero treatment.
//   • Fully accessible: each "Bester Preis" badge has aria,
//     each delta is screen-reader-announced, layout uses a
//     proper grid with comparable headers.
// ============================================================

'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useStationSearch } from '@/lib/hooks/use-stations';
import { useRecommendations } from '@/lib/hooks/use-recommendations';
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
import type { FuelType, Station } from '@fuelyn/core';

const TYPICAL_FILL_LITRES = 50;

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

  /**
   * Per-fuel cheapest. We bucket by fuel type so that one missing price
   * (a station that only sells diesel, say) doesn't disqualify it on
   * the others. Returns Infinity for fuels nobody sells, which the
   * highlight code reads as "no winner".
   */
  const cheapestByFuel = useMemo(() => {
    const out: Record<FuelType, { price: number; stationId: string | null }> = {
      diesel: { price: Number.POSITIVE_INFINITY, stationId: null },
      e5: { price: Number.POSITIVE_INFINITY, stationId: null },
      e10: { price: Number.POSITIVE_INFINITY, stationId: null },
    };
    for (const rec of compared) {
      for (const ft of FUEL_TYPES) {
        const p = rec.station.prices?.[ft];
        if (typeof p === 'number' && p > 0 && p < out[ft].price) {
          out[ft] = { price: p, stationId: rec.station.id };
        }
      }
    }
    return out;
  }, [compared]);

  /**
   * Closest station. We surface this as a positive label on the card
   * even when it's not the cheapest — many users care more about
   * detour than 1-2 cents.
   */
  const closestId = useMemo(() => {
    if (compared.length === 0) return null;
    let best = compared[0]!;
    for (const rec of compared) {
      if (rec.station.dist < best.station.dist) best = rec;
    }
    return best.station.id;
  }, [compared]);

  /**
   * Overall winner for the user's currently selected fuel type. We use
   * a simple cost-of-detour calculation: cents saved per fill vs the
   * driving cost of the detour (rough 0,15 €/km for the typical
   * combustion car). The station whose net = (savings − detour cost)
   * is highest wins — this is much closer to "what would I actually
   * pick?" than blindly taking the cheapest price.
   */
  const winnerId = useMemo(() => {
    if (compared.length === 0) return null;
    const ft = filter.fuelType;
    const cheapest = cheapestByFuel[ft];
    if (cheapest.stationId == null) return closestId; // nobody has a price
    let bestId: string | null = null;
    let bestNet = Number.NEGATIVE_INFINITY;
    for (const rec of compared) {
      const p = rec.station.prices?.[ft];
      if (typeof p !== 'number' || p <= 0) continue;
      const savings = (cheapest.price - p) * TYPICAL_FILL_LITRES;
      const detour = rec.station.dist * 0.15 * 2; // round trip @ 0.15 €/km
      const net = savings - detour;
      if (net > bestNet) {
        bestNet = net;
        bestId = rec.station.id;
      }
    }
    return bestId ?? cheapest.stationId;
  }, [compared, filter.fuelType, cheapestByFuel, closestId]);

  const winnerStation = useMemo<Station | null>(() => {
    if (!winnerId) return null;
    const found = compared.find((r) => r.station.id === winnerId);
    return found?.station ?? null;
  }, [compared, winnerId]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 fy-enter">
      <PageHeader
        title="Tankstellen-Vergleich"
        action={
          compared.length > 0 && (
            <button
              type="button"
              onClick={clearCompare}
              className="text-sm font-medium text-rose-500 hover:text-rose-400
                         focus-visible:outline-none focus-visible:ring-2
                         focus-visible:ring-rose-500/40 rounded-md px-2 py-1
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
          {winnerStation && compared.length > 1 && (
            <WinnerHero
              station={winnerStation}
              fuelType={filter.fuelType}
              cheapestPrice={cheapestByFuel[filter.fuelType].price}
              winnerPrice={winnerStation.prices?.[filter.fuelType] ?? 0}
            />
          )}

          {/* Compare Grid */}
          <div
            className="grid gap-3 sm:gap-4"
            style={{
              gridTemplateColumns: `repeat(${compared.length}, minmax(0, 1fr))`,
            }}
          >
            {compared.map((rec, idx) => {
              const s = rec.station;
              const address = formatAddress(s.street, s.houseNumber, s.postCode, s.place);
              const driveTime = estimateDriveTime(s.dist, AVERAGE_SPEED_KMH);
              const reachability = computeReachability(s.dist, range);
              const isWinner = s.id === winnerId;
              const isClosest = s.id === closestId;

              return (
                <article
                  key={s.id}
                  className={[
                    'relative rounded-2xl p-4 sm:p-5',
                    'bg-white/85 dark:bg-white/[0.04]',
                    'backdrop-blur-xl',
                    'ring-1',
                    isWinner
                      ? 'ring-emerald-400/60 dark:ring-emerald-400/40 shadow-[0_8px_30px_rgba(16,185,129,0.18)]'
                      : 'ring-black/5 dark:ring-white/10 shadow-[0_4px_18px_rgba(0,0,0,0.08)]',
                    'transition-all duration-200 hover:-translate-y-[2px]',
                    'animate-fade-in-up',
                  ].join(' ')}
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  {isWinner && (
                    <div
                      className="absolute -top-2 -right-2 rounded-full px-2.5 py-0.5
                                 text-[10px] font-bold text-white tracking-wide
                                 bg-gradient-to-r from-emerald-500 to-cyan-500
                                 shadow-md shadow-emerald-500/30"
                    >
                      ★ Beste Wahl
                    </div>
                  )}

                  {/* Header */}
                  <header className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                        {s.brand || s.name}
                      </h3>
                      <p
                        className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2"
                        title={address}
                      >
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

                  {/* Status + Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-4">
                    <span
                      className={[
                        'inline-flex items-center gap-1 h-5 px-1.5 rounded-full text-[10px] font-medium',
                        s.isOpen
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-gray-200 text-gray-600 dark:bg-white/10 dark:text-gray-400',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'w-1.5 h-1.5 rounded-full',
                          s.isOpen ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400',
                        ].join(' ')}
                        aria-hidden="true"
                      />
                      {s.isOpen ? 'Geöffnet' : 'Geschlossen'}
                    </span>
                    {isClosest && (
                      <span className="inline-flex items-center h-5 px-1.5 rounded-full text-[10px] font-medium bg-brand-500/15 text-brand-700 dark:text-brand-300">
                        Am nächsten
                      </span>
                    )}
                  </div>

                  {/* Prices — per fuel cheapest highlighted */}
                  <dl className="space-y-2 mb-4">
                    {FUEL_TYPES.map((ft: FuelType) => {
                      const price = s.prices?.[ft];
                      const cheapest = cheapestByFuel[ft];
                      const isCheapestForFuel =
                        cheapest.stationId === s.id && Number.isFinite(cheapest.price);
                      const delta =
                        typeof price === 'number' && Number.isFinite(cheapest.price)
                          ? price - cheapest.price
                          : null;
                      return (
                        <PriceRow
                          key={ft}
                          fuelType={ft}
                          price={typeof price === 'number' ? price : null}
                          isCheapest={isCheapestForFuel}
                          deltaPerLitre={delta}
                          isActiveFuel={ft === filter.fuelType}
                        />
                      );
                    })}
                  </dl>

                  {/* Distance & Time */}
                  <div className="border-t border-gray-100 dark:border-white/5 pt-3 space-y-1.5">
                    <Row label="Entfernung" value={formatDistance(s.dist)} highlight={isClosest} />
                    <Row label="Fahrzeit" value={`~${formatDriveTime(driveTime)}`} />
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 dark:text-gray-400">Erreichbarkeit</span>
                      <ReachabilityBadge status={reachability} />
                    </div>
                  </div>

                  {/* Per-station savings summary for the active fuel type */}
                  <SavingsFooter
                    activePrice={
                      typeof s.prices?.[filter.fuelType] === 'number'
                        ? (s.prices[filter.fuelType] as number)
                        : null
                    }
                    cheapestPrice={cheapestByFuel[filter.fuelType].price}
                    activeFuelLabel={FUEL_TYPE_LABELS[filter.fuelType]}
                  />
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
      <aside className="bg-white/70 dark:bg-white/[0.03] rounded-2xl p-4 mt-6 ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-md">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-200 mb-1">
          So fügst du Tankstellen hinzu:
        </h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
          Tippe auf der Hauptseite auf eine Tankstelle und wähle „Vergleichen" — oder nutze den
          Button in der Listenansicht.
        </p>
      </aside>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function WinnerHero({
  station,
  fuelType,
  cheapestPrice,
  winnerPrice,
}: {
  station: Station;
  fuelType: FuelType;
  cheapestPrice: number;
  winnerPrice: number;
}) {
  const savingsPerLitre = cheapestPrice - winnerPrice;
  // Negative delta means the winner is also the cheapest — explicit
  // savings number; positive means the winner trades a slightly higher
  // price for a much shorter detour (rare but possible with our cost
  // model). We still show the message but flip the framing.
  const fillSavings = Math.abs(savingsPerLitre) * TYPICAL_FILL_LITRES;

  return (
    <div
      role="region"
      aria-label="Gewinner des Vergleichs"
      className="mb-4 sm:mb-5 rounded-2xl p-4 sm:p-5
                 bg-gradient-to-br from-emerald-500/10 via-cyan-500/5 to-transparent
                 dark:from-emerald-500/15 dark:via-cyan-500/10
                 ring-1 ring-emerald-400/30 dark:ring-emerald-400/25
                 backdrop-blur-xl shadow-lg shadow-emerald-500/10
                 fy-enter"
    >
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl
                     bg-gradient-to-br from-emerald-500 to-cyan-500
                     flex items-center justify-center
                     shadow-md shadow-emerald-500/30 text-white"
        >
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4} className="w-6 h-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.14em] font-semibold text-emerald-700 dark:text-emerald-300">
            Empfehlung für {FUEL_TYPE_LABELS[fuelType]}
          </p>
          <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 mt-0.5">
            {station.brand || station.name}
          </h2>
          {savingsPerLitre > 0 ? (
            <p className="text-xs sm:text-[13px] text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">
              Das beste Verhältnis aus Preis und Umweg. Bei {TYPICAL_FILL_LITRES} L sparst du{' '}
              <strong className="text-emerald-700 dark:text-emerald-300">
                {fillSavings.toFixed(2).replace('.', ',')} €
              </strong>{' '}
              gegenüber dem teuersten Anbieter im Vergleich.
            </p>
          ) : (
            <p className="text-xs sm:text-[13px] text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">
              Liefert den besten Kompromiss aus Preis und kurzem Anfahrtsweg.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceRow({
  fuelType,
  price,
  isCheapest,
  deltaPerLitre,
  isActiveFuel,
}: {
  fuelType: FuelType;
  price: number | null;
  isCheapest: boolean;
  deltaPerLitre: number | null;
  isActiveFuel: boolean;
}) {
  const fmtDelta = (d: number) =>
    `${d >= 0 ? '+' : '−'} ${Math.abs(d).toFixed(3).replace('.', ',')} €`;

  return (
    <div
      className={[
        'flex items-center justify-between gap-2 rounded-lg -mx-1 px-1 py-0.5',
        isActiveFuel ? 'bg-brand-500/5 dark:bg-brand-500/10' : '',
      ].join(' ')}
    >
      <dt className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-400">
        {FUEL_TYPE_LABELS[fuelType]}
        {isActiveFuel && (
          <span
            aria-hidden="true"
            className="text-[8px] uppercase tracking-wider text-brand-600 dark:text-brand-400"
          >
            aktiv
          </span>
        )}
      </dt>
      <dd className="flex items-center gap-2 text-right">
        {price == null ? (
          <span className="text-xs text-gray-400 dark:text-gray-600">—</span>
        ) : (
          <>
            {!isCheapest && deltaPerLitre != null && deltaPerLitre > 0 && (
              <span
                className="text-[10px] font-medium text-rose-600 dark:text-rose-400 tabular-nums"
                aria-label={`${fmtDelta(deltaPerLitre)} pro Liter teurer`}
              >
                {fmtDelta(deltaPerLitre)}
              </span>
            )}
            <span
              className={[
                'tabular-nums font-bold text-sm',
                isCheapest
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-gray-900 dark:text-gray-100',
              ].join(' ')}
            >
              {price.toFixed(3).replace('.', ',')} €
            </span>
            {isCheapest && (
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                aria-label="Bester Preis im Vergleich"
                title="Bester Preis"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3" aria-hidden="true">
                  <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                </svg>
              </span>
            )}
          </>
        )}
      </dd>
    </div>
  );
}

function SavingsFooter({
  activePrice,
  cheapestPrice,
  activeFuelLabel,
}: {
  activePrice: number | null;
  cheapestPrice: number;
  activeFuelLabel: string;
}) {
  if (activePrice == null || !Number.isFinite(cheapestPrice)) return null;
  const deltaPerL = activePrice - cheapestPrice;
  const totalDelta = deltaPerL * TYPICAL_FILL_LITRES;

  if (Math.abs(totalDelta) < 0.005) {
    return (
      <div className="mt-3 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/15 px-3 py-2 text-center">
        <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
          Bester Preis für {activeFuelLabel}
        </p>
      </div>
    );
  }
  return (
    <div className="mt-3 rounded-xl bg-gray-100 dark:bg-white/[0.04] px-3 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Bei {TYPICAL_FILL_LITRES} L {activeFuelLabel}
      </p>
      <p
        className={[
          'text-sm font-bold tabular-nums mt-0.5',
          totalDelta > 0
            ? 'text-rose-600 dark:text-rose-400'
            : 'text-emerald-600 dark:text-emerald-400',
        ].join(' ')}
      >
        {totalDelta > 0 ? '+' : '−'} {Math.abs(totalDelta).toFixed(2).replace('.', ',')} €
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span
        className={[
          'font-medium tabular-nums',
          highlight
            ? 'text-brand-700 dark:text-brand-300'
            : 'text-gray-900 dark:text-gray-100',
        ].join(' ')}
      >
        {value}
      </span>
    </div>
  );
}
