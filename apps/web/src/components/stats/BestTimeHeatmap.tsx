// ============================================================
// BestTimeHeatmap — 7×24 grid showing avg price by weekday × hour.
//
// Color scale: cheapest → emerald, mid → neutral, priciest → rose.
// The best/worst cells get a thick brand-color border so they
// pop visually even on a busy dark background.
//
// Data source: Zustand priceHistory (filtered to active fuel).
// Pure CSS grid — no chart library, identical UX to a heavy
// d3/Recharts implementation at zero KB cost.
// ============================================================

'use client';

import { useMemo } from 'react';
import {
  buildBestTimeHeatmap,
  type HeatmapCell,
} from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { useIsHydrated } from '@/lib/hooks/use-is-hydrated';

const HOURS = 24;
const DAYS = 7;

export function BestTimeHeatmap({ className = '' }: { className?: string }) {
  const { t, locale } = useTranslations();
  const hydrated = useIsHydrated();
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const snapshots = useAppStore((s) => s.priceHistory);

  const heatmap = useMemo(() => {
    const filtered = snapshots
      .filter((s) => s.fuelType === fuelType)
      .map((s) => ({ timestamp: s.timestamp, price: s.price }));
    return buildBestTimeHeatmap(filtered);
  }, [snapshots, fuelType]);

  if (!hydrated) return null;
  if (heatmap.sampleCount === 0) {
    return (
      <section
        aria-label={t('bestTimeHeatmap.title')}
        className={`bg-white dark:bg-gray-800/90 rounded-2xl shadow-card
                    border border-gray-100 dark:border-gray-700/60 p-5 ${className}`}
      >
        <header className="mb-2">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {t('bestTimeHeatmap.title')}
          </h3>
        </header>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('bestTimeHeatmap.empty')}
        </p>
      </section>
    );
  }

  const min = heatmap.bestCell?.avgPrice ?? 0;
  const max = heatmap.worstCell?.avgPrice ?? 1;
  const range = max - min || 1;

  const dayLabels = buildDayLabels(locale);

  return (
    <section
      aria-label={t('bestTimeHeatmap.title')}
      className={`bg-white dark:bg-gray-800/90 rounded-2xl shadow-card
                  border border-gray-100 dark:border-gray-700/60 p-5 ${className}`}
    >
      <header className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {t('bestTimeHeatmap.title')}
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
            {t('bestTimeHeatmap.subtitle').replace('{count}', String(heatmap.sampleCount))}
          </p>
        </div>
        <ConfidenceBadge confidence={heatmap.confidence} t={t} />
      </header>

      {/* Best / worst summary chips */}
      {heatmap.bestCell && heatmap.worstCell && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <SummaryChip
            tone="best"
            label={t('bestTimeHeatmap.bestLabel')}
            cell={heatmap.bestCell}
            dayLabels={dayLabels}
          />
          <SummaryChip
            tone="worst"
            label={t('bestTimeHeatmap.worstLabel')}
            cell={heatmap.worstCell}
            dayLabels={dayLabels}
          />
        </div>
      )}

      {/* The grid itself.
          - Sticky-ish hour-axis at the top in 4-hour increments
          - Day rows on the left
          - 168 cells colored on the cheap→pricey gradient */}
      <div className="overflow-x-auto -mx-5 px-5">
        <div className="inline-grid gap-px" style={{ gridTemplateColumns: `auto repeat(${HOURS}, 14px)` }}>
          {/* Hour-axis header row */}
          <div />
          {Array.from({ length: HOURS }).map((_, h) => (
            <div
              key={`axis-${h}`}
              className="text-[8px] font-medium text-gray-400 dark:text-gray-500 text-center"
            >
              {h % 4 === 0 ? String(h).padStart(2, '0') : ''}
            </div>
          ))}

          {/* Day rows */}
          {Array.from({ length: DAYS }).map((_, dow) => (
            <DayRow
              key={`row-${dow}`}
              cells={heatmap.cells[dow] ?? []}
              dow={dow}
              dayLabel={dayLabels[dow] ?? ''}
              min={min}
              range={range}
              best={heatmap.bestCell}
              worst={heatmap.worstCell}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function DayRow({
  cells,
  dow,
  dayLabel,
  min,
  range,
  best,
  worst,
}: {
  cells: readonly HeatmapCell[];
  dow: number;
  dayLabel: string;
  min: number;
  range: number;
  best: HeatmapCell | null;
  worst: HeatmapCell | null;
}) {
  return (
    <>
      <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 pr-2 self-center">
        {dayLabel}
      </div>
      {cells.map((c) => (
        <Cell
          key={`c-${dow}-${c.hour}`}
          cell={c}
          min={min}
          range={range}
          isBest={best?.dayOfWeek === c.dayOfWeek && best?.hour === c.hour}
          isWorst={worst?.dayOfWeek === c.dayOfWeek && worst?.hour === c.hour}
        />
      ))}
    </>
  );
}

function Cell({
  cell,
  min,
  range,
  isBest,
  isWorst,
}: {
  cell: HeatmapCell;
  min: number;
  range: number;
  isBest: boolean;
  isWorst: boolean;
}) {
  if (cell.avgPrice == null) {
    return (
      <div
        className="w-3.5 h-3.5 rounded-sm bg-gray-100 dark:bg-gray-700/50"
        aria-hidden="true"
        title="—"
      />
    );
  }
  const t = (cell.avgPrice - min) / range; // 0=cheapest, 1=priciest
  const bg = colorForT(t);
  const border = isBest
    ? 'ring-2 ring-emerald-500'
    : isWorst
      ? 'ring-2 ring-rose-500'
      : '';
  return (
    <div
      className={`w-3.5 h-3.5 rounded-sm ${border}`}
      style={{ backgroundColor: bg }}
      title={`${cell.avgPrice.toFixed(3).replace('.', ',')} €/L (${cell.count})`}
      aria-label={`${cell.avgPrice.toFixed(3)} EUR/L based on ${cell.count} samples`}
    />
  );
}

/**
 * Linear interpolation along the heatmap gradient — emerald
 * (cheapest) → amber (mid) → rose (priciest). Returns an
 * RGB string the inline `style` accepts.
 */
function colorForT(t: number): string {
  const safe = Math.max(0, Math.min(1, t));
  // Emerald 500 → Amber 500 → Rose 500
  const stops = [
    [0.0, [16, 185, 129]],   // emerald
    [0.5, [245, 158, 11]],   // amber
    [1.0, [244, 63, 94]],    // rose
  ] as const;
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i]!;
    const [t1, c1] = stops[i + 1]!;
    if (safe >= t0 && safe <= t1) {
      const u = (safe - t0) / (t1 - t0);
      const r = Math.round(c0[0] + (c1[0] - c0[0]) * u);
      const g = Math.round(c0[1] + (c1[1] - c0[1]) * u);
      const b = Math.round(c0[2] + (c1[2] - c0[2]) * u);
      return `rgb(${r}, ${g}, ${b})`;
    }
  }
  return `rgb(${stops[stops.length - 1]![1].join(', ')})`;
}

function ConfidenceBadge({ confidence, t }: { confidence: number; t: (k: string) => string }) {
  const tier = confidence >= 0.5 ? 'high' : confidence >= 0.25 ? 'medium' : 'low';
  const cls = {
    high: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    low: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  }[tier];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
      {t(`bestTimeHeatmap.confidence.${tier}`)}
    </span>
  );
}

function SummaryChip({
  tone,
  label,
  cell,
  dayLabels,
}: {
  tone: 'best' | 'worst';
  label: string;
  cell: HeatmapCell;
  dayLabels: string[];
}) {
  const dotClass = tone === 'best' ? 'bg-emerald-500' : 'bg-rose-500';
  return (
    <div className="px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 flex items-center gap-2">
      <span className={`w-2 h-2 rounded-full ${dotClass}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-gray-400 dark:text-gray-500">
          {label}
        </p>
        <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
          {dayLabels[cell.dayOfWeek]} · {String(cell.hour).padStart(2, '0')}:00
        </p>
        {cell.avgPrice != null && (
          <p className="text-[10px] text-gray-500 dark:text-gray-400 tabular-nums">
            ⌀ {cell.avgPrice.toFixed(3).replace('.', ',')} €/L
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Build short Mo-first weekday labels for the active locale via
 * Intl.DateTimeFormat. We use Jan 5 2026 as the anchor Monday.
 */
function buildDayLabels(locale: string): string[] {
  const monday = new Date(Date.UTC(2026, 0, 5));
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    try {
      out.push(new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d));
    } catch {
      out.push(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'][i]!);
    }
  }
  return out;
}
