// ============================================================
// TripCostCard — surfaces a Trip Cost Estimate next to the
// route planner. Picks vehicle + fuel + average market price
// from the user's Zustand store.
// ============================================================

'use client';

import { useMemo } from 'react';
import { estimateTripCost, type Coordinates } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';

export interface TripCostCardProps {
  start: Coordinates | null;
  end: Coordinates | null;
  /** Optional pre-routed road distance (km). */
  roadDistanceKm?: number;
  /** Optional override for the round-trip toggle. */
  roundTrip?: boolean;
  className?: string;
}

export function TripCostCard({ start, end, roadDistanceKm, roundTrip, className = '' }: TripCostCardProps) {
  const { t, locale } = useTranslations();
  const hydrated = useIsHydrated();
  const vehicle = useAppStore((s) => s.vehicle);
  const market = useAppStore((s) => s.priceHistory);

  const estimate = useMemo(() => {
    if (!start || !end || !vehicle) return null;

    // Use the most recent 30 snapshots for the user's fuel
    // type as the price reference. Falls back to a sensible
    // €1.80 if there's no market data yet — tells the user
    // upfront what assumption we used.
    const fuel = vehicle.fuelType;
    const recent = market
      .filter((s) => s.fuelType === fuel)
      .slice(-30);
    const avgPrice = recent.length > 0
      ? recent.reduce((acc, s) => acc + s.price, 0) / recent.length
      : 1.8;

    return estimateTripCost({
      start,
      end,
      roadDistanceKm,
      vehicle: {
        consumption: vehicle.consumption,
        fuelType: vehicle.fuelType,
        tankCapacity: vehicle.tankCapacity,
      },
      pricePerLiter: avgPrice,
      roundTrip: roundTrip ?? false,
    });
  }, [start, end, roadDistanceKm, vehicle, market, roundTrip]);

  if (!hydrated) return null;
  if (!start || !end) return null;
  if (!vehicle || vehicle.consumption == null) {
    return (
      <article className={`rounded-2xl border border-[var(--color-border-subtle)] p-4 ${className}`}>
        <p className="text-sm text-[var(--color-fg-subtle)]">
          {t('tripCost.needsVehicle')}
        </p>
      </article>
    );
  }
  if (!estimate) return null;

  const moneyFmt = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(v);

  return (
    <article
      aria-label={t('tripCost.title')}
      className={`rounded-2xl border border-[var(--color-border-subtle)]
                  bg-[var(--color-surface)]/85 backdrop-blur-md
                  shadow-[var(--shadow-sm)] p-4 ${className}`}
    >
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          {t('tripCost.title')}
        </h3>
        <span className="text-[10px] text-[var(--color-fg-subtle)]">
          {estimate.distanceMode === 'road'
            ? t('tripCost.modeRoad')
            : t('tripCost.modeAir')}
        </span>
      </header>

      <div className="flex items-baseline gap-3 mb-3">
        <p className="text-3xl font-extrabold text-[var(--color-fg)] tabular-nums">
          {moneyFmt(estimate.costEur)}
        </p>
        {estimate.roundTrip && (
          <span className="text-[10px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
            {t('tripCost.roundTrip')}
          </span>
        )}
      </div>

      <dl className="grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-[9px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
            {t('tripCost.distance')}
          </dt>
          <dd className="text-sm font-bold text-[var(--color-fg)] tabular-nums">
            {estimate.distanceKm} km
          </dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
            {t('tripCost.liters')}
          </dt>
          <dd className="text-sm font-bold text-[var(--color-fg)] tabular-nums">
            {estimate.litersNeeded} L
          </dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-wider text-[var(--color-fg-subtle)]">
            {t('tripCost.co2')}
          </dt>
          <dd className="text-sm font-bold text-[var(--color-fg)] tabular-nums">
            {Math.round(estimate.co2Kg)} kg
          </dd>
        </div>
      </dl>

      {estimate.needsRefuel && (
        <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 rounded-lg px-2 py-1.5 border border-amber-200 dark:border-amber-800/50">
          ⛽ {t('tripCost.needsRefuel').replace('{fills}', estimate.tankFills?.toFixed(1) ?? '?')}
        </p>
      )}

      <p className="mt-2 text-[10px] text-[var(--color-fg-subtle)] text-center">
        {t('tripCost.assumesPrice').replace('{price}', moneyFmt(estimate.pricePerLiter))}
      </p>
    </article>
  );
}
