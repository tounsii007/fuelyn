'use client';

import { use } from 'react';
import Link from 'next/link';
import { useStationDetail } from '@/lib/hooks/use-stations';
import { useAppStore } from '@/lib/store/app-store';
import { PriceTag } from '@/components/ui/PriceTag';
import { ReachabilityBadge } from '@/components/ui/ReachabilityBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { OpeningHoursDetail } from '@/components/stations/OpeningHoursDetail';
import { PriceHistoryChart } from '@/components/stations/PriceHistoryChart';
import { PriceReportForm } from '@/components/stations/PriceReportForm';
import { WalletPassButton } from '@/components/stations/WalletPassButton';
import { PriceTrendChart } from '@/components/charts/PriceTrendChart';
import { FuelAdvisor } from '@/components/intelligence/FuelAdvisor';
import {
  FUEL_TYPES,
  FUEL_TYPE_LABELS,
  formatAddress,
  formatDistance,
  formatDriveTime,
  formatPrice,
  computeReachability,
  computeRemainingRange,
  estimateDriveTime,
  AVERAGE_SPEED_KMH,
} from '@fuelyn/core';
import type { FuelType } from '@fuelyn/core';
import { getBrandConfig } from '@/lib/brand-config';

export default function StationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: station, isLoading, isError } = useStationDetail(id);
  const vehicle = useAppStore((state) => state.vehicle);
  const filter = useAppStore((state) => state.filter);
  const isFavorite = useAppStore((state) => state.isFavorite(id));
  const addFavorite = useAppStore((state) => state.addFavorite);
  const removeFavorite = useAppStore((state) => state.removeFavorite);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError || !station) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <EmptyState
          icon={'⚠️'}
          title="Tankstelle nicht gefunden"
          message="Die Daten konnten nicht geladen werden."
          action={{ label: 'Zurück', onClick: () => window.history.back() }}
        />
      </div>
    );
  }

  const address = formatAddress(station.street, station.houseNumber, station.postCode, station.place);
  const driveTime = estimateDriveTime(station.dist, AVERAGE_SPEED_KMH);
  const range = vehicle ? computeRemainingRange(vehicle) : null;
  const reachability = computeReachability(station.dist, range);
  const brandConfig = getBrandConfig(station.brand);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`;

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
    const text = `${station.brand || station.name}\n${address}\n${FUEL_TYPES.map((ft: FuelType) => {
      const stationPrice = station.prices?.[ft];
      return `${FUEL_TYPE_LABELS[ft]}: ${stationPrice != null ? `${formatPrice(stationPrice)} €` : '—'}`;
    }).join('\n')}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: `${station.brand || station.name} — Fuelyn`, text });
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
    <div className="mx-auto max-w-2xl animate-fade-in">
      <div
        className="relative overflow-hidden rounded-b-3xl px-6 pb-6 pt-4"
        style={{ background: brandConfig.gradient }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%, rgba(255,255,255,0.1) 100%)',
          }}
        />

        <Link
          href="/"
          className="relative mb-4 inline-flex items-center gap-1 text-sm text-white/80 transition-colors hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Zurück
        </Link>

        <div className="relative flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold shadow-lg"
              style={{
                background: 'rgba(255,255,255,0.2)',
                backdropFilter: 'blur(8px)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)',
              }}
            >
              {brandConfig.initials}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white drop-shadow-sm">{station.brand || station.name}</h1>
              <p className="mt-0.5 text-sm text-white/70">{station.name}</p>
              <p className="text-sm text-white/70">{address}</p>
            </div>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              station.isOpen ? 'bg-white/20 text-white' : 'bg-black/20 text-white/70'
            }`}
          >
            {station.isOpen ? 'Geöffnet' : 'Geschlossen'}
          </span>
        </div>
      </div>

      <div className="px-6 pb-6 pt-4">
        <div className="mb-4 rounded-2xl bg-white p-5 shadow-card dark:bg-surface-dark-secondary">
          <h2 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">Aktuelle Preise</h2>
          <div className="grid grid-cols-3 gap-4">
            {FUEL_TYPES.map((ft: FuelType) => (
              <div key={ft} className="text-center">
                <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">{FUEL_TYPE_LABELS[ft]}</p>
                <PriceTag price={station.prices?.[ft] ?? null} fuelType={ft} size="lg" />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4 rounded-2xl bg-white p-5 shadow-card dark:bg-surface-dark-secondary">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Entfernung</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{formatDistance(station.dist)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Fahrzeit</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">~{formatDriveTime(driveTime)}</p>
            </div>
            <div>
              <ReachabilityBadge status={reachability} />
            </div>
          </div>
        </div>

        <OpeningHoursDetail
          openingTimes={station.openingTimes}
          wholeDay={station.wholeDay}
          overrides={station.overrides}
          isOpen={station.isOpen}
        />
        <div className="mb-4" />

        <PriceHistoryChart stationId={station.id} />
        <div className="mb-4" />

        {/* Anonymous price-correction submission + Add-to-Wallet shortcut.
            The two share a row because they're both "act on this station's
            current price" affordances. */}
        <div className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]/30 p-4 mb-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <PriceReportForm
              stationId={station.id}
              knownPrices={{
                diesel: station.prices?.diesel ?? null,
                e5: station.prices?.e5 ?? null,
                e10: station.prices?.e10 ?? null,
              }}
            />
            {(station.prices?.[filter.fuelType] ?? null) != null && (
              <WalletPassButton
                stationId={station.id}
                stationLabel={station.brand || station.name}
                cityLine={`${station.postCode} ${station.place}`}
                fuelLabel={FUEL_TYPE_LABELS[filter.fuelType]}
                priceEurPerL={(station.prices[filter.fuelType] ?? 0)
                  .toFixed(3)
                  .replace('.', ',')
                  .replace(/0+$/, '')
                  .replace(/,$/, '')}
              />
            )}
          </div>
        </div>

        {/* KI Price Trend Chart */}
        <PriceTrendChart fuelType={filter.fuelType} className="mb-4" />

        {/* KI Fuel Advisor */}
        <FuelAdvisor className="mb-4" />

        <div className="mt-6 flex gap-3">
          <a
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-3 text-sm
                       font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 active:bg-brand-800"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m0 0l3-3m-3 3l-3-3" />
            </svg>
            Navigation starten
          </a>
          <button
            type="button"
            onClick={handleFavoriteToggle}
            className={`rounded-xl px-5 py-3 text-sm font-semibold shadow-sm transition-colors ${
              isFavorite
                ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300'
            }`}
          >
            {isFavorite ? 'Favorit entfernen' : 'Favorit'}
          </button>
          <button
            type="button"
            onClick={handleShare}
            className="rounded-xl bg-gray-100 px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm
                       transition-colors hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            aria-label="Teilen"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
