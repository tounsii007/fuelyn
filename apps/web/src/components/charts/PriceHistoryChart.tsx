// ============================================================
// PriceHistoryChart -- Pure SVG price trend chart
// Features: 7/30 day toggle, line + area fill, min/max/avg
// annotations, responsive sizing, brand colors.
// ============================================================

'use client';

import { useState, useMemo, useId } from 'react';
import type { PriceDataPoint } from '@/lib/utils/mock-price-history';
import { generateMockPriceHistory } from '@/lib/utils/mock-price-history';
import { formatPrice, FUEL_TYPE_LABELS } from '@tankpilot/core';
import type { FuelType } from '@tankpilot/core';

type Period = 7 | 30;

interface PriceHistoryChartProps {
  /** External data; when omitted, mock data is generated. */
  data?: PriceDataPoint[];
  fuelType?: FuelType;
  /** Show the period toggle (default true). */
  showToggle?: boolean;
  className?: string;
}

// ---- SVG layout constants ----
const SVG_W = 400;
const SVG_H = 160;
const PAD_T = 24;
const PAD_B = 28;
const PAD_L = 8;
const PAD_R = 8;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

function toX(index: number, count: number): number {
  if (count <= 1) return PAD_L + PLOT_W / 2;
  return PAD_L + (index / (count - 1)) * PLOT_W;
}

function toY(price: number, min: number, range: number): number {
  if (range === 0) return PAD_T + PLOT_H / 2;
  return PAD_T + PLOT_H - ((price - min) / range) * PLOT_H;
}

export function PriceHistoryChart({
  data: externalData,
  fuelType = 'e10',
  showToggle = true,
  className = '',
}: PriceHistoryChartProps) {
  const [period, setPeriod] = useState<Period>(7);
  const gradientId = useId();

  // Use external data or generate mock data
  const rawData = useMemo(() => {
    if (externalData && externalData.length > 0) return externalData;
    return generateMockPriceHistory(period, undefined, fuelType);
  }, [externalData, period, fuelType]);

  // Slice to the active period when using external data
  const data = useMemo(() => {
    if (!externalData) return rawData;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - period);
    return rawData.filter((d) => new Date(d.timestamp) >= cutoff);
  }, [rawData, externalData, period]);

  // Stats
  const { prices, min, max, avg, range, trend } = useMemo(() => {
    const p = data.map((d) => d.price);
    const mn = Math.min(...p);
    const mx = Math.max(...p);
    const av = p.reduce((s, v) => s + v, 0) / (p.length || 1);
    const rng = mx - mn || 0.01;
    const last = p[p.length - 1] ?? 0;
    const first = p[0] ?? 0;
    return { prices: p, min: mn, max: mx, avg: av, range: rng, trend: last - first };
  }, [data]);

  // SVG points
  const points = useMemo(() =>
    data.map((d, i) => ({
      x: toX(i, data.length),
      y: toY(d.price, min, range),
      price: d.price,
      timestamp: d.timestamp,
    })),
  [data, min, range]);

  if (data.length < 2) return null;

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const lastPt = points[points.length - 1]!;
  const firstPt = points[0]!;
  const areaD = `${pathD} L${lastPt.x.toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} L${firstPt.x.toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`;

  // Min / Max point indices
  const minIdx = prices.indexOf(min);
  const maxIdx = prices.indexOf(max);
  const minPt = points[minIdx]!;
  const maxPt = points[maxIdx]!;

  // Average Y
  const avgY = toY(avg, min, range);

  // Date labels
  const formatDateLabel = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
  };

  // Mid label
  const midIdx = Math.floor(data.length / 2);
  const midPt = points[midIdx];

  const trendColor = trend > 0.001 ? '#EF4444' : trend < -0.001 ? '#10B981' : '#94A3B8';
  const trendArrow = trend > 0.001 ? '\u2191' : trend < -0.001 ? '\u2193' : '\u2192';

  return (
    <div className={`bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Preisverlauf
          </h3>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            {FUEL_TYPE_LABELS[fuelType]}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Trend badge */}
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{
              color: trendColor,
              backgroundColor: `${trendColor}15`,
            }}
          >
            {trendArrow} {Math.abs(trend).toFixed(3)} &euro;
          </span>

          {/* Period toggle */}
          {showToggle && (
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              {([7, 30] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 text-[10px] font-semibold rounded-md transition-all
                    ${period === p
                      ? 'bg-white dark:bg-gray-600 text-brand-600 dark:text-brand-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                >
                  {p}T
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full"
        style={{ height: 'auto', maxHeight: 180 }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Preisverlauf ${FUEL_TYPE_LABELS[fuelType]} letzte ${period} Tage`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2575EA" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#2575EA" stopOpacity={0} />
          </linearGradient>
        </defs>

        {/* Average dashed line */}
        <line
          x1={PAD_L}
          y1={avgY}
          x2={PAD_L + PLOT_W}
          y2={avgY}
          stroke="#94A3B8"
          strokeWidth={0.8}
          strokeDasharray="4 3"
        />
        <text
          x={PAD_L + 2}
          y={avgY - 4}
          fill="#94A3B8"
          fontSize={8}
          fontFamily="Inter, system-ui, sans-serif"
        >
          {'\u00d8'} {formatPrice(avg)}
        </text>

        {/* Area fill */}
        <path d={areaD} fill={`url(#${gradientId})`} />

        {/* Main line */}
        <path
          d={pathD}
          fill="none"
          stroke="#2575EA"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Min annotation */}
        <circle cx={minPt.x} cy={minPt.y} r={3} fill="#10B981" stroke="white" strokeWidth={1.5} />
        <text
          x={minPt.x}
          y={minPt.y + 12}
          fill="#10B981"
          fontSize={8}
          fontWeight={700}
          fontFamily="Inter, system-ui, sans-serif"
          textAnchor="middle"
        >
          Min {formatPrice(min)}
        </text>

        {/* Max annotation */}
        <circle cx={maxPt.x} cy={maxPt.y} r={3} fill="#EF4444" stroke="white" strokeWidth={1.5} />
        <text
          x={maxPt.x}
          y={maxPt.y - 6}
          fill="#EF4444"
          fontSize={8}
          fontWeight={700}
          fontFamily="Inter, system-ui, sans-serif"
          textAnchor="middle"
        >
          Max {formatPrice(max)}
        </text>

        {/* Current price dot */}
        <circle cx={lastPt.x} cy={lastPt.y} r={4} fill="#2575EA" stroke="white" strokeWidth={2} />

        {/* X-axis date labels */}
        <text
          x={firstPt.x}
          y={SVG_H - 6}
          fill="#94A3B8"
          fontSize={8}
          fontFamily="Inter, system-ui, sans-serif"
          textAnchor="start"
        >
          {formatDateLabel(firstPt.timestamp)}
        </text>
        {midPt && (
          <text
            x={midPt.x}
            y={SVG_H - 6}
            fill="#94A3B8"
            fontSize={8}
            fontFamily="Inter, system-ui, sans-serif"
            textAnchor="middle"
          >
            {formatDateLabel(midPt.timestamp)}
          </text>
        )}
        <text
          x={lastPt.x}
          y={SVG_H - 6}
          fill="#94A3B8"
          fontSize={8}
          fontFamily="Inter, system-ui, sans-serif"
          textAnchor="end"
        >
          {formatDateLabel(lastPt.timestamp)}
        </text>
      </svg>

      {/* Stats row */}
      <div className="flex justify-between mt-3 text-[10px]">
        <div className="text-center">
          <span className="text-gray-400 dark:text-gray-500 block">Min</span>
          <span className="font-bold text-green-600 dark:text-green-400">{formatPrice(min)} &euro;</span>
        </div>
        <div className="text-center">
          <span className="text-gray-400 dark:text-gray-500 block">{'\u00d8'} Schnitt</span>
          <span className="font-bold text-gray-700 dark:text-gray-300">{formatPrice(avg)} &euro;</span>
        </div>
        <div className="text-center">
          <span className="text-gray-400 dark:text-gray-500 block">Max</span>
          <span className="font-bold text-red-500">{formatPrice(max)} &euro;</span>
        </div>
        <div className="text-center">
          <span className="text-gray-400 dark:text-gray-500 block">Aktuell</span>
          <span className="font-bold text-brand-600 dark:text-brand-400">
            {formatPrice(prices[prices.length - 1] ?? 0)} &euro;
          </span>
        </div>
      </div>
    </div>
  );
}
