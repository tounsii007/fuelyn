// ============================================================
// StationCardV2 — modern, glass-morphic card with:
//   • Animated gradient border on hover/best-option
//   • Big price typography (tabular nums)
//   • Subtle hover-lift, press-down feedback
//   • Status badges (open / best deal / favorite)
//
// Drop-in replacement for the legacy StationCard. Same props
// interface so existing call sites can migrate by import-swap.
// ============================================================

'use client';

import { useAppStore } from '@/lib/store/app-store';
import type { StationRecommendation } from '@fuelyn/core';
import { Badge } from '@/components/ui/Badge';

export interface StationCardV2Props {
  recommendation: StationRecommendation;
  onClick?: () => void;
}

export function StationCardV2({ recommendation, onClick }: StationCardV2Props) {
  const { station, reachabilityStatus, estimatedDriveTime, isBestOption, reasons } =
    recommendation;
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const isFavorite = useAppStore((s) => s.isFavorite(station.id));
  const addFavorite = useAppStore((s) => s.addFavorite);
  const removeFavorite = useAppStore((s) => s.removeFavorite);

  const price = station.prices?.[fuelType];
  const priceFormatted =
    typeof price === 'number'
      ? price.toFixed(3).replace('.', ',') + ' €'
      : '–';
  const fullAddress = [
    [station.street, station.houseNumber].filter(Boolean).join(' '),
    [station.postCode, station.place].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFavorite) {
      removeFavorite(station.id);
    } else {
      addFavorite({
        stationId: station.id,
        name: station.name ?? station.brand ?? 'Tankstelle',
        brand: station.brand ?? '',
        addedAt: new Date().toISOString(),
      });
    }
  };

  const reachable = reachabilityStatus !== 'unreachable';

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'relative group w-full text-left rounded-[var(--radius-xl)]',
        'transition-[transform,box-shadow] duration-[var(--duration-default)] ease-[var(--ease-spring)]',
        'hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)] active:translate-y-0',
        isBestOption ? 'p-[1.5px]' : '',
        isBestOption
          ? 'bg-gradient-to-br from-[var(--color-brand-500)] via-[var(--color-accent-500)] to-[var(--color-brand-700)]'
          : '',
      ].join(' ')}
    >
      {/* Gradient-border wrapper for best option; otherwise bare card */}
      <div
        className={[
          'relative rounded-[calc(var(--radius-xl)-1.5px)]',
          'bg-[var(--color-surface)] border',
          isBestOption
            ? 'border-transparent'
            : 'border-[var(--color-border)]',
          'p-4',
        ].join(' ')}
      >
        {/* Top row: brand + status pill + favorite */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-[var(--color-fg)] truncate">
                {station.name || station.brand || 'Tankstelle'}
              </span>
              {station.isOpen === false && (
                <Badge tone="danger" size="sm">
                  geschlossen
                </Badge>
              )}
            </div>
            <span className="text-xs text-[var(--color-fg-subtle)] truncate">{fullAddress}</span>
          </div>

          <button
            type="button"
            aria-label={isFavorite ? 'Favorit entfernen' : 'Als Favorit speichern'}
            onClick={handleFavorite}
            className={[
              'flex-shrink-0 w-8 h-8 rounded-full grid place-items-center',
              'transition-colors',
              isFavorite
                ? 'text-[var(--color-danger-500)] bg-[oklch(0.96_0.05_25)] dark:bg-[oklch(0.30_0.10_25)]'
                : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)] hover:bg-[var(--color-surface-hover)]',
            ].join(' ')}
          >
            <svg className="w-4 h-4" fill={isFavorite ? 'currentColor' : 'none'} viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
          </button>
        </div>

        {/* Middle row: price + distance */}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-fg-subtle)] leading-none">
              {fuelType.toUpperCase()}
            </span>
            <span className="font-bold text-[28px] leading-none tabular-nums tracking-tight text-[var(--color-fg)] mt-1">
              {priceFormatted}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-[var(--color-fg-subtle)]">
              {station.dist != null ? `${station.dist.toFixed(1)} km` : ''}
            </span>
            {estimatedDriveTime && (
              <span className="text-xs text-[var(--color-fg-subtle)]">
                ≈ {estimatedDriveTime} min
              </span>
            )}
          </div>
        </div>

        {/* Bottom row: status badges */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {isBestOption && (
            <Badge tone="brand" leadingIcon={<StarIcon />}>
              Beste Wahl
            </Badge>
          )}
          {reachable && (
            <Badge tone="success" leadingIcon={<CheckIcon />}>
              Erreichbar
            </Badge>
          )}
          {!reachable && (
            <Badge tone="warning" leadingIcon={<AlertIcon />}>
              Knappe Reichweite
            </Badge>
          )}
          {reasons?.slice(0, 1).map((r, i) => (
            <Badge key={i} tone="neutral">
              {r}
            </Badge>
          ))}
        </div>

        {/* Hover sheen overlay */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 group-hover:opacity-100
                     transition-opacity bg-gradient-to-br from-white/0 via-white/[0.04] to-transparent"
        />
      </div>
    </button>
  );
}

// ─── Icons ─────────────────────────────────────────────────

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.48 3.5a.563.563 0 0 1 1.04 0l2.13 5.11 5.5.43c.51.04.72.69.32 1l-4.18 3.42 1.27 5.36a.562.562 0 0 1-.84.61L12 16.97l-4.72 2.46a.562.562 0 0 1-.84-.61l1.27-5.36-4.18-3.42a.563.563 0 0 1 .32-1l5.5-.43L11.48 3.5Z" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M12 9v3m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    </svg>
  );
}
