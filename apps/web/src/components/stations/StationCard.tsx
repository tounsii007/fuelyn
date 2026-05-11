// ============================================================
// StationCard — Rich station card for list and detail views
// ============================================================

'use client';

import { memo, useCallback, useRef, useState } from 'react';
import type { StationRecommendation } from '@fuelyn/core';
import { formatDistance, formatDriveTime, formatAddress } from '@fuelyn/core';
import { PriceTag } from '../ui/PriceTag';
import { ReachabilityBadge } from '../ui/ReachabilityBadge';
import { BrandBadge } from '../ui/BrandBadge';
import { Sparkline } from '../charts/Sparkline';
import { ReportPriceDialog } from './ReportPriceDialog';
import { useAppStore } from '@/lib/store/app-store';
import { useStationHistory } from '@/lib/hooks/use-station-history';
import { useInView } from '@/lib/hooks/use-in-view';

interface StationCardProps {
  recommendation: StationRecommendation;
  /**
   * Average price across the same-fuel cohort this card belongs to.
   * Optional — when present we render a coloured delta-vs-⌀ badge so
   * the user can scan a long list and pick out genuine deals at a
   * glance instead of mentally subtracting cents.
   */
  marketAvg?: number | null;
  /**
   * Stable click handler from the parent. Phase 10: by passing the
   * id-aware callback (instead of `() => onStationClick(id)`) the
   * prop reference stays referentially stable across renders, which
   * lets React.memo actually skip work when nothing else changed.
   */
  onStationClick?: (id: string) => void;
  /** Legacy zero-arg click (kept for backwards compat). */
  onClick?: () => void;
}

function StationCardImpl({ recommendation, marketAvg, onStationClick, onClick }: StationCardProps) {
  const { station, reachabilityStatus, estimatedDriveTime, isBestOption, reasons } =
    recommendation;
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const isFavorite = useAppStore((s) => s.isFavorite(station.id));
  const addFavorite = useAppStore((s) => s.addFavorite);
  const removeFavorite = useAppStore((s) => s.removeFavorite);
  // Subscribe to the BOOLEAN, not the underlying array. Otherwise every
  // card re-renders whenever any other station gets added to the
  // compare set — Object.is bails the diff but we still spend the
  // selector cost per card. With 4 500+ stations across the app, that
  // adds up. Subscribing to the derived boolean lets Zustand skip the
  // notification for cards whose membership didn't change.
  const isCompared = useAppStore((s) => s.compareStationIds.includes(station.id));
  const toggleCompare = useAppStore((s) => s.toggleCompareStation);

  const address = formatAddress(station.street, station.houseNumber, station.postCode, station.place);
  const price = station.prices?.[fuelType] ?? null;

  // Cents-difference vs market average — null if avg unavailable or
  // station has no price for the selected fuel. Rendered as a small
  // tonal badge below the price tag.
  const deltaCt = price != null && marketAvg != null
    ? Math.round((price - marketAvg) * 1000) / 10
    : null;

  // ─── Phase 4 — Detour-savings badge ─────────────────────────
  // When the user has an active route, compute whether stopping at
  // THIS station genuinely saves money once the extra detour fuel
  // cost is taken into account. Cohort-cheapest's price drives the
  // baseline saving; vehicle profile (if any) sharpens the drive
  // cost; otherwise we fall back to a 0.18 €/km flat estimate.
  //
  // Returns either a positive Δ-€ (you actually save once the detour
  // is paid for), a negative Δ (the detour eats your savings), or
  // null (no active route). Badge only renders when |Δ| ≥ 0.10 €.
  const activeRoute = useAppStore((s) => s.activeRoute);
  const vehicle = useAppStore((s) => s.vehicle);
  const detourSavings = (() => {
    if (!activeRoute || marketAvg == null || price == null) return null;
    if (typeof station.dist !== 'number' || station.dist < 0) return null;
    // Round-trip detour kilometres relative to the user's current point.
    // Coarse estimate — when we have full route geometry (Phase 4 next
    // milestone) we'll swap this for the actual orthogonal-distance to
    // the route polyline.
    const detourKm = station.dist * 2;
    const driveCostPerKm = vehicle?.consumption
      ? (vehicle.consumption / 100) * price
      : 0.18;
    const fillUpLitres = vehicle?.tankCapacity ?? 50;
    const priceSavings = (marketAvg - price) * fillUpLitres;
    const detourCost = detourKm * driveCostPerKm;
    const net = priceSavings - detourCost;
    return Math.round(net * 100) / 100;
  })();

  // ─── 24h sparkline + trend arrow ────────────────────────────
  // Lazy-loaded: useStationHistory only fires when this card has
  // scrolled within ~120 px of the viewport. A 14-card list would
  // otherwise spike LCP with 14 simultaneous network requests.
  const cardRef = useRef<HTMLDivElement>(null);
  const inView = useInView(cardRef);
  const { data: histResponse } = useStationHistory({
    stationId: station.id,
    fuelType,
    range: '24h',
    enabled: inView,
  });
  const history = histResponse?.history ?? [];

  // Trend direction derived from the history series. Strict thresholds
  // keep "stable" the default — a tiny noise blip shouldn't tilt the
  // arrow. Values are in €/L.
  const trendDirection = computeTrendDirection(history);

  const handleFavoriteToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFavorite) {
      removeFavorite(station.id);
    } else {
      addFavorite({
        stationId: station.id,
        name: station.name,
        brand: station.brand,
        addedAt: new Date().toISOString(),
      });
    }
  };

  /**
   * Phase 8 — Community-Report (real backend wire-up).
   *
   * Opens an in-app dialog that POSTs to /api/reports →
   * gateway → price-service. The previous mailto MVP is replaced.
   * Rate-limit + per-device fingerprint live server-side.
   */
  const [reportOpen, setReportOpen] = useState(false);
  const handleReportPrice = (e: React.MouseEvent) => {
    e.stopPropagation();
    setReportOpen(true);
  };

  // Stable click handler: prefer the id-aware callback so the
  // `onClick` prop reference stays stable across renders (memo win).
  const handleClick = useCallback(() => {
    if (onStationClick) onStationClick(station.id);
    else if (onClick) onClick();
  }, [onStationClick, onClick, station.id]);

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClick(); }}
      className={`w-full text-left px-3 py-2.5 rounded-2xl cursor-pointer
        bg-white dark:bg-surface-dark-secondary
        border border-gray-100 dark:border-gray-700/60
        shadow-card fy-card-interactive
        ${isBestOption ? 'ring-1.5 ring-brand-500 ring-offset-1 dark:ring-offset-surface-dark' : ''}
        animate-fade-in group`}
    >
      {/* Best Option Badge */}
      {isBestOption && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-600 text-white">
            Beste Option
          </span>
        </div>
      )}

      {/* Header Row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <BrandBadge brand={station.brand} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {station.brand || station.name}
              </h3>
              <span
                className={`flex-shrink-0 w-2 h-2 rounded-full ${
                  station.isOpen ? 'bg-reach-safe' : 'bg-gray-300 dark:bg-gray-600'
                }`}
                title={station.isOpen ? 'Geöffnet' : 'Geschlossen'}
              />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              {address}
            </p>
          </div>
        </div>

        {/* Price + sparkline + delta-vs-market badge */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-1.5">
            {/* 24h trend arrow — colour-coded so glance-scan tells
                you "this station is on the way down (good)" without
                reading the sparkline numerically. */}
            <TrendArrow direction={trendDirection} />
            <PriceTag price={price} fuelType={fuelType} size="md" />
          </div>
          {/* 24h Sparkline. Empty/loading → dashed baseline placeholder. */}
          <Sparkline
            data={history}
            width={56}
            height={14}
            className="opacity-90 group-hover:opacity-100 transition-opacity"
            ariaLabel={`24h Preisverlauf für ${station.brand || station.name}`}
          />
          {deltaCt != null && Math.abs(deltaCt) >= 0.1 && (
            <span
              className={[
                'inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full',
                'text-[9px] font-semibold tabular-nums leading-tight',
                'border',
                deltaCt < 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700/40'
                  : 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-700/40',
              ].join(' ')}
              title={deltaCt < 0 ? 'Günstiger als der Markt-Durchschnitt' : 'Teurer als der Markt-Durchschnitt'}
            >
              {deltaCt < 0 ? '−' : '+'}{Math.abs(deltaCt).toFixed(1)} ct ⌀
            </span>
          )}
          {/* Phase 4 — Detour-savings badge. Only when an active route
              is set AND the net of (price-saving × tank) − (detour-cost)
              is meaningful enough to surface (≥ 0.10 €). */}
          {detourSavings != null && Math.abs(detourSavings) >= 0.10 && (
            <span
              className={[
                'inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full',
                'text-[9px] font-semibold tabular-nums leading-tight',
                'border',
                detourSavings > 0
                  ? 'bg-brand-50 text-brand-700 border-brand-200 dark:bg-brand-900/30 dark:text-brand-300 dark:border-brand-700/40'
                  : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700/40',
              ].join(' ')}
              title={
                detourSavings > 0
                  ? `Auf Route lohnt sich der Stop (Spart €${detourSavings.toFixed(2)} netto)`
                  : `Umweg frisst die Ersparnis (Mehrkosten €${Math.abs(detourSavings).toFixed(2)})`
              }
            >
              {detourSavings > 0 ? '🛣 +' : '🛣 −'}{Math.abs(detourSavings).toFixed(2)} €
            </span>
          )}
        </div>
      </div>

      {/* Meta Row */}
      <div className="flex items-center flex-wrap gap-2 mt-1.5">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatDistance(station.dist)}
        </span>
        <span className="text-gray-300 dark:text-gray-600">|</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          ~{formatDriveTime(estimatedDriveTime)}
        </span>

        {reachabilityStatus !== 'safe' && (
          <ReachabilityBadge status={reachabilityStatus} />
        )}

        {/* Compare button */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleCompare(station.id); }}
          className={`ml-auto p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
            isCompared ? 'text-brand-600' : 'text-gray-300 dark:text-gray-600 group-hover:text-gray-400'
          }`}
          aria-label={isCompared ? 'Aus Vergleich entfernen' : 'Zum Vergleich hinzufügen'}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </button>

        {/* Favorite button */}
        <button
          type="button"
          onClick={handleFavoriteToggle}
          className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label={isFavorite ? 'Favorit entfernen' : 'Als Favorit speichern'}
        >
          <svg
            className={`w-5 h-5 transition-colors ${
              isFavorite
                ? 'text-red-500 fill-red-500'
                : 'text-gray-300 dark:text-gray-600 group-hover:text-gray-400'
            }`}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            fill={isFavorite ? 'currentColor' : 'none'}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
            />
          </svg>
        </button>

        {/* Phase 8 — Report wrong price (mailto MVP).
            Tucked at the end of the meta row, low visual weight: the
            user only needs it when something is genuinely off. */}
        <button
          type="button"
          onClick={handleReportPrice}
          className="p-1 rounded-lg transition-colors text-gray-300 dark:text-gray-600
                     group-hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          aria-label="Preis melden"
          title="Preis-Korrektur melden"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4a4 4 0 014-4h10a4 4 0 014 4v4M3 21h18M9 5l3-3 3 3M12 2v10" />
          </svg>
        </button>
      </div>

      {/* Reasons */}
      {reasons.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {reasons.slice(0, 3).map((reason) => (
            <span
              key={reason}
              className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
            >
              {reason}
            </span>
          ))}
        </div>
      )}

      {/* Phase 8 — report dialog (mounted at card level so it
          inherits the click-outside boundary correctly). */}
      <ReportPriceDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        stationId={station.id}
        stationName={station.brand || station.name}
        fuelType={fuelType as 'diesel' | 'e5' | 'e10'}
        displayedPrice={price}
      />
    </div>
  );
}

/**
 * Memoised export — Phase 10. With the new `onStationClick(id)`
 * stable-prop pattern + stable `recommendation` references coming
 * from TanStack Query, React.memo cleanly skips re-rendering cards
 * whose data hasn't changed. On a 50-card list this halves the
 * paint cost of the side panel during scroll.
 */
export const StationCard = memo(StationCardImpl);

// ─── Local helpers ─────────────────────────────────────────────

type TrendDirection = 'falling' | 'rising' | 'stable';

/**
 * Compare a "recent half" mean to an "earlier half" mean. More
 * resilient to single-point noise than first-vs-last comparison.
 * 0.003 €/L ≈ 0.3 ct/L is the noise floor below which we report
 * STABLE.
 */
function computeTrendDirection(
  history: ReadonlyArray<{ price: number }>,
): TrendDirection {
  if (history.length < 4) return 'stable';
  const prices = history.map((h) => h.price).filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length < 4) return 'stable';
  const half = Math.floor(prices.length / 2);
  const earlier = prices.slice(0, half);
  const recent = prices.slice(prices.length - half);
  const earlierMean = earlier.reduce((s, p) => s + p, 0) / earlier.length;
  const recentMean = recent.reduce((s, p) => s + p, 0) / recent.length;
  const slope = recentMean - earlierMean;
  if (slope > 0.003) return 'rising';
  if (slope < -0.003) return 'falling';
  return 'stable';
}

function TrendArrow({ direction }: { direction: TrendDirection }) {
  const cfg =
    direction === 'falling'
      ? { rotate: '45deg',  color: 'text-emerald-600 dark:text-emerald-400', label: 'Trend fallend' }
      : direction === 'rising'
        ? { rotate: '-45deg', color: 'text-rose-600 dark:text-rose-400',     label: 'Trend steigend' }
        : { rotate: '0deg',  color: 'text-slate-400 dark:text-slate-500',   label: 'Trend stabil' };
  return (
    <span
      className={`inline-flex items-center justify-center w-3.5 h-3.5 ${cfg.color}`}
      title={cfg.label}
      aria-label={cfg.label}
    >
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.4}
        aria-hidden="true"
        style={{ transform: `rotate(${cfg.rotate})`, transition: 'transform 0.2s ease' }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}
