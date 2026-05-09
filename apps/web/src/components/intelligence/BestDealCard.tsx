// ============================================================
// BestDealCard — Fuelyn premium hero card
//
// Sits at the top of the right sidebar. Aggregates the cheapest
// reachable station into a single high-density, high-impact tile:
//
//   ┌──────────────────────────────────────────────────┐
//   │ ✨ TOP DEAL · LIVE                  ↪ DETAILS    │
//   │                                                  │
//   │ Aral Bahnhofstr. 12                              │
//   │ 35037 Marburg                                    │
//   │                                                  │
//   │   1.7⁴⁹  €/L      ·     Spar-3,2 ct/L            │
//   │  ▔▔▔▔▔▔             vs Markt-⌀                  │
//   │                                                  │
//   │ ●   1.2 km · 3 min · GEÖFFNET                    │
//   └──────────────────────────────────────────────────┘
//
// Design language: layered gradients (brand → cyan → violet),
// subtle inner shadow, brand-glow ring on hover, pulsing live-dot.
// Dark-mode first; light-mode preserves contrast via tokens.
// ============================================================

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { StationRecommendation } from '@fuelyn/core';
import { formatDistance, formatDriveTime, estimateDriveTime, AVERAGE_SPEED_KMH } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { PriceTag } from '@/components/ui/PriceTag';

export interface BestDealCardProps {
  readonly recommendations: readonly StationRecommendation[];
}

export function BestDealCard({ recommendations }: BestDealCardProps) {
  const { t } = useTranslations();
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const vehicle = useAppStore((s) => s.vehicle);

  // Pick the canonical "best deal" — lowest price among open stations.
  // Plus the full price distribution for the live-index visualisation
  // and the per-fill savings projection.
  const { best, savingsCt, marketAvg, marketMin, marketMax, allPrices } = useMemo(() => {
    if (recommendations.length === 0) {
      return {
        best: null,
        savingsCt: 0,
        marketAvg: null,
        marketMin: null,
        marketMax: null,
        allPrices: [] as number[],
      };
    }
    const open = recommendations.filter((r) => r.station.isOpen);
    const pool = open.length > 0 ? open : recommendations;
    const prices = pool
      .map((r) => r.station.prices?.[fuelType])
      .filter((p): p is number => Number.isFinite(p as number));
    if (prices.length === 0) {
      return {
        best: null,
        savingsCt: 0,
        marketAvg: null,
        marketMin: null,
        marketMax: null,
        allPrices: [] as number[],
      };
    }
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    const best = pool.find((r) => r.station.prices?.[fuelType] === min) ?? null;
    return {
      best,
      savingsCt: (avg - min) * 100,
      marketAvg: avg,
      marketMin: min,
      marketMax: max,
      allPrices: prices,
    };
  }, [recommendations, fuelType]);

  if (!best || marketAvg == null || marketMin == null || marketMax == null) return null;

  // Per-fill savings projection. Uses vehicle tank capacity when set,
  // otherwise the conventional 50 L default. The number is what the
  // user saves PER TANK by going to the best deal vs. the market avg.
  const tankL = vehicle?.tankCapacity ?? 50;
  const savingsPerFillEur = ((marketAvg - marketMin) * tankL);

  /**
   * Position helper for the index bar: maps a price into 0..100
   * based on the visible spread. Saturates at 0 when spread is
   * zero (all prices identical) so we never divide by zero.
   */
  const spread = marketMax - marketMin;
  const positionPct = (p: number) => (spread > 0 ? ((p - marketMin) / spread) * 100 : 0);

  const station = best.station;
  const driveTime = estimateDriveTime(station.dist, AVERAGE_SPEED_KMH);
  const isOpen = station.isOpen ?? true;

  return (
    <article
      aria-label={t('station.bestOption')}
      className="relative mx-4 mt-3 mb-4 overflow-hidden rounded-2xl
                 border border-[color:oklch(0.45_0.18_250/0.45)]
                 bg-gradient-to-br from-[color:oklch(0.20_0.05_250/0.95)]
                                  via-[color:oklch(0.18_0.07_255/0.85)]
                                  to-[color:oklch(0.16_0.10_280/0.80)]
                 backdrop-blur-md
                 shadow-[var(--shadow-cinematic)]
                 transition-all duration-300
                 hover:shadow-[var(--shadow-glow-brand)]
                 hover:border-[color:oklch(0.62_0.24_245/0.6)]
                 group"
    >
      {/* Top-right radial halo — subtle neon */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 -right-12 w-48 h-48 rounded-full opacity-70 blur-2xl
                   bg-[radial-gradient(circle,_oklch(0.62_0.24_245/0.45)_0%,_transparent_70%)]"
      />
      {/* Bottom-left violet halo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-16 -left-16 w-56 h-56 rounded-full opacity-50 blur-2xl
                   bg-[radial-gradient(circle,_oklch(0.58_0.25_295/0.35)_0%,_transparent_70%)]"
      />

      <div className="relative p-4">
        {/* Header row — eyebrow + live indicator */}
        <header className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
            <SparkleIcon />
            {t('bestDeal.eyebrow')}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--color-fg-subtle)]">
            <span className="relative inline-flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </span>
            {t('bestDeal.live')}
          </span>
        </header>

        {/* Station identity */}
        <Link
          href={`/station/${station.id}`}
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60 rounded-lg"
        >
          <h3 className="text-base font-semibold text-white truncate">
            {station.brand || station.name}
          </h3>
          <p className="text-xs text-[var(--color-fg-subtle)] truncate mt-0.5">
            {station.street}{' '}{station.houseNumber} · {station.postCode} {station.place}
          </p>
        </Link>

        {/* Price hero */}
        <div className="mt-4 flex items-baseline gap-3">
          <PriceTag price={station.prices?.[fuelType] ?? null} fuelType={fuelType} size="lg" />
          {savingsCt > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                             text-[10px] font-bold uppercase tracking-wider
                             text-emerald-300 bg-emerald-500/10
                             border border-emerald-400/30
                             shadow-[0_0_18px_-4px_oklch(0.68_0.20_150/0.45)]">
              <ArrowDownIcon />
              {savingsCt.toFixed(1)}&nbsp;{t('panel.belowAvg')}
            </span>
          )}
        </div>

        {/* Stat strip */}
        <dl className="mt-4 grid grid-cols-3 gap-2 text-[11px]">
          <Stat icon={<RouteIcon />} label={t('station.distance')}>
            {formatDistance(station.dist)}
          </Stat>
          <Stat icon={<ClockIcon />} label={t('station.driveTime')}>
            ~{formatDriveTime(driveTime)}
          </Stat>
          <Stat
            icon={<DotIcon className={isOpen ? 'text-emerald-400' : 'text-amber-400'} />}
            label={t('station.openingTimes')}
            tone={isOpen ? 'success' : 'warning'}
          >
            {isOpen ? t('station.open') : t('station.closed')}
          </Stat>
        </dl>

        {/*
          Live-Preisindex — horizontal gradient bar from green
          (cheapest in the visible market) through amber to red
          (most expensive). Each station's price is drawn as a
          vertical tick along the bar, the avg is marked white,
          and this best deal sits at the leftmost edge by
          definition. Gives the user instant "where in the
          distribution does my best deal sit?" intuition.

          Suppressed when there are < 3 priced stations (a tick
          for two prices is just two dots, not a distribution).
        */}
        {allPrices.length >= 3 && spread > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between text-[10px] mb-1.5">
              <span className="text-emerald-300 font-semibold tabular-nums">
                {marketMin.toFixed(3).replace('.', ',')} €
              </span>
              <span className="text-[var(--color-fg-subtle)] uppercase tracking-wider">
                {t('bestDeal.indexLabel')} · {allPrices.length} {t('station.stations')}
              </span>
              <span className="text-rose-300 font-semibold tabular-nums">
                {marketMax.toFixed(3).replace('.', ',')} €
              </span>
            </div>
            <div
              className="relative h-2 rounded-full overflow-visible
                         bg-gradient-to-r from-emerald-400/70 via-amber-400/60 to-rose-500/70"
              role="img"
              aria-label={`${t('bestDeal.indexLabel')}: ${marketMin.toFixed(3)} €  –  ${marketMax.toFixed(3)} €`}
            >
              {/* Per-station ticks — drawn under markers so they
                  don't overlap the headline best/avg indicators. */}
              {allPrices.map((p, i) => (
                <span
                  key={`tick-${i}`}
                  aria-hidden="true"
                  className="absolute top-0 bottom-0 w-px bg-white/35"
                  style={{ left: `${positionPct(p)}%` }}
                />
              ))}
              {/* Avg marker — white pill */}
              <span
                aria-hidden="true"
                className="absolute top-1/2 -translate-y-1/2 -ml-1 w-2 h-3 rounded-sm
                           bg-white/90 ring-1 ring-black/30"
                style={{ left: `${positionPct(marketAvg)}%` }}
                title={`${t('bestDeal.marketAvgTooltip')}: ${marketAvg.toFixed(3)} €`}
              />
              {/* Best marker — green dot at the leftmost edge with
                  a soft glow, label sits below for clarity. */}
              <span
                aria-hidden="true"
                className="absolute top-1/2 -translate-y-1/2 -ml-1.5 w-3 h-3 rounded-full
                           bg-emerald-400 ring-2 ring-emerald-200/60
                           shadow-[0_0_10px_rgba(52,211,153,0.6)]"
                style={{ left: `${positionPct(marketMin)}%` }}
                title={t('bestDeal.bestPriceTooltip')}
              />
            </div>
            {/*
              Per-fill savings line — turns the abstract "−ct vs ⌀"
              into a concrete € figure based on the user's tank
              capacity (50 L default when no profile). This is the
              "should I drive here?" anchor.
            */}
            {savingsPerFillEur > 0.05 && (
              <p className="mt-2 text-[10px] text-emerald-200/90 text-center">
                {t('bestDeal.perFillSavings')}{' '}
                <span className="font-bold text-emerald-300">
                  {savingsPerFillEur.toFixed(2)} €
                </span>{' '}
                {t('bestDeal.perFillUnit')} ({Math.round(tankL)} L)
              </p>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function Stat({
  icon,
  label,
  tone = 'neutral',
  children,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: 'neutral' | 'success' | 'warning';
  children: React.ReactNode;
}) {
  const valueClass =
    tone === 'success'
      ? 'text-emerald-300'
      : tone === 'warning'
        ? 'text-amber-300'
        : 'text-white/95';
  return (
    <div className="flex flex-col gap-0.5 px-2.5 py-2 rounded-xl bg-white/5 border border-white/10">
      <div className="flex items-center gap-1.5 text-[var(--color-fg-subtle)]">
        <span className="w-3 h-3 inline-flex">{icon}</span>
        <span className="text-[9px] font-medium uppercase tracking-wider">{label}</span>
      </div>
      <span className={`text-xs font-semibold tabular-nums ${valueClass}`}>{children}</span>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2zm6 12l.9 2.4L21 17l-2.1.6L18 20l-.9-2.4L15 17l2.1-.6.9-2.4z" />
    </svg>
  );
}

function ArrowDownIcon() {
  return (
    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-6-6m6 6l6-6" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5-5 5-5M15 4l5 5-5 5M4 15h12a4 4 0 004-4V9" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 7v5l3 2" />
    </svg>
  );
}

function DotIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
    </svg>
  );
}
