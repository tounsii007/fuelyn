// ============================================================
// PricePredictionCard — 24h price forecast for one fuel type.
//
// Renders a compact card with:
//   - Headline: "Best time to fuel up" with predicted hour +
//     savings vs the worst hour
//   - 24h sparkline-style bar chart showing the trace
//   - Confidence badge (high / medium / low)
//   - Trend rationale chip (down-trending / up-trending / stable)
//
// Reads price snapshots from the Zustand store (already
// populated by the homepage's recording useEffect) and runs
// the prediction client-side via core's predictNext24h. No
// network call needed.
// ============================================================

'use client';

import { useMemo } from 'react';
import {
  predictNext24h,
  type PredictedHour,
  type PricePrediction,
} from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';

export interface PricePredictionCardProps {
  /**
   * Optional station id to scope the snapshots to. When omitted,
   * the prediction runs against ALL snapshots for the active fuel
   * type — useful as a market-wide signal on the home page.
   */
  readonly stationId?: string;
}

export function PricePredictionCard({ stationId }: PricePredictionCardProps) {
  const { t, locale } = useTranslations();
  const hydrated = useIsHydrated();
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const snapshots = useAppStore((s) => s.priceHistory);

  // Filter snapshots to the right fuel type + optional station.
  // Memoised because the list can be ≤500 entries and re-running
  // the prediction is the cheapest part of this component.
  const prediction = useMemo<PricePrediction | null>(() => {
    if (!hydrated) return null;
    const filtered = snapshots
      .filter((s) => s.fuelType === fuelType)
      .filter((s) => (stationId ? s.stationId === stationId : true))
      .map((s) => ({ timestamp: s.timestamp, price: s.price }));
    if (filtered.length === 0) return null;
    return predictNext24h(filtered);
  }, [snapshots, fuelType, stationId, hydrated]);

  // Mount-gate: the snapshot history lives in Zustand-persist,
  // so SSR and the first hydration pass would see an empty array
  // → "no data" — then the data appears on the next tick. Skip
  // server render to avoid that flash.
  if (!hydrated) return null;
  if (!prediction || prediction.confidence < 0.05) return null;

  const confidenceTier =
    prediction.confidence >= 0.65
      ? 'high'
      : prediction.confidence >= 0.35
        ? 'medium'
        : 'low';

  const rationaleKey = `pricePrediction.rationale.${prediction.rationale}` as const;
  const confidenceKey = `pricePrediction.confidence.${confidenceTier}` as const;

  return (
    <article
      aria-label={t('pricePrediction.title')}
      className="mx-4 mt-3 mb-4 overflow-hidden rounded-2xl
                 border border-[var(--color-border-subtle)]
                 bg-[var(--color-surface)]/85
                 backdrop-blur-md shadow-[var(--shadow-sm)]
                 px-4 py-3"
    >
      <header className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--color-fg-subtle)]">
          {t('pricePrediction.title')}
        </h3>
        <span
          className={[
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold',
            confidenceTier === 'high'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
              : confidenceTier === 'medium'
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
          ].join(' ')}
        >
          {t(confidenceKey)}
        </span>
      </header>

      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] text-[var(--color-fg-subtle)] mb-0.5">
            {t('pricePrediction.bestHourLabel')}
          </p>
          <p className="text-2xl font-extrabold text-[var(--color-fg)] tabular-nums">
            {formatHour(prediction.bestHour, locale)}
          </p>
          <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium tabular-nums">
            {prediction.bestHour.price.toFixed(3).replace('.', ',')} €/L
          </p>
        </div>

        {prediction.spreadEurPerL > 0.001 && (
          <div className="text-right">
            <p className="text-[11px] text-[var(--color-fg-subtle)] mb-0.5">
              {t('pricePrediction.savingsLabel')}
            </p>
            <p className="text-base font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              −{(prediction.spreadEurPerL * 100).toFixed(1)} ct/L
            </p>
            <p className="text-[10px] text-[var(--color-fg-subtle)]">
              {t('pricePrediction.vsWorstHour').replace(
                '{hour}',
                formatHour(prediction.worstHour, locale),
              )}
            </p>
          </div>
        )}
      </div>

      {/* 24h sparkline — pure CSS, no chart library needed for
          this density (24 bars ≤ 8 px wide each). */}
      <Sparkline trace={prediction.hourly} />

      <p className="mt-2 text-[10px] text-[var(--color-fg-subtle)] text-center">
        {t(rationaleKey)}
      </p>
    </article>
  );
}

function Sparkline({ trace }: { trace: readonly PredictedHour[] }) {
  const min = Math.min(...trace.map((h) => h.price));
  const max = Math.max(...trace.map((h) => h.price));
  const range = max - min || 1; // avoid /0 when prediction is flat
  const minIdx = trace.findIndex((h) => h.price === min);
  const maxIdx = trace.findIndex((h) => h.price === max);

  return (
    <div
      className="flex items-end justify-between gap-px h-12"
      role="img"
      aria-label="24h price forecast"
    >
      {trace.map((h, i) => {
        const heightPct = 25 + ((h.price - min) / range) * 75; // floor at 25 % so even the cheapest hour is visible
        const isBest = i === minIdx;
        const isWorst = i === maxIdx;
        return (
          <span
            key={i}
            className={[
              'flex-1 rounded-sm',
              isBest
                ? 'bg-emerald-500 dark:bg-emerald-400'
                : isWorst
                  ? 'bg-rose-500 dark:bg-rose-400'
                  : 'bg-[var(--color-border)] dark:bg-[var(--color-border-strong)]',
            ].join(' ')}
            style={{ height: `${heightPct}%` }}
            title={`${String(h.hour).padStart(2, '0')}:00 — ${h.price.toFixed(3).replace('.', ',')} €/L`}
          />
        );
      })}
    </div>
  );
}

function formatHour(p: PredictedHour, locale: string): string {
  // Use Intl so en-US gets "9 AM", de gets "09:00", fr gets "09:00".
  try {
    const d = new Date();
    d.setHours(p.hour, 0, 0, 0);
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(d);
  } catch {
    return `${String(p.hour).padStart(2, '0')}:00`;
  }
}
