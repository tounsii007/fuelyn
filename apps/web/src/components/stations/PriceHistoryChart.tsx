// ============================================================
// Price History Chart — Preisverlauf
// ============================================================

'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { formatPrice, FUEL_TYPE_LABELS } from '@tankpilot/core';

interface PriceHistoryChartProps {
  stationId: string;
}

export function PriceHistoryChart({ stationId }: PriceHistoryChartProps) {
  const priceHistory = useAppStore((s) => s.priceHistory);
  const fuelType = useAppStore((s) => s.filter.fuelType);

  const data = useMemo(() => {
    return priceHistory
      .filter((p) =>
        p.stationId === stationId &&
        p.fuelType === fuelType &&
        Number.isFinite(p.price) &&
        Number.isFinite(Date.parse(p.timestamp)),
      )
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .slice(-20); // last 20 snapshots
  }, [priceHistory, stationId, fuelType]);

  if (data.length < 2) return null;

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 0.01;
  const current = prices.at(-1);
  const previous = prices.at(-2);
  if (current == null || previous == null) return null;
  const trend = current - previous;

  // SVG line chart
  const width = 280;
  const height = 60;
  const padding = 4;
  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * (width - 2 * padding);
    const y = height - padding - ((d.price - min) / range) * (height - 2 * padding);
    return { x, y, price: d.price, time: d.timestamp };
  });
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const lastPoint = points.at(-1);
  const firstPoint = points[0];
  if (!firstPoint || !lastPoint) return null;
  const areaD = `${pathD} L ${lastPoint.x} ${height} L ${firstPoint.x} ${height} Z`;

  return (
    <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-700 dark:text-gray-300">
          Preisverlauf ({FUEL_TYPE_LABELS[fuelType]})
        </h3>
        <div className="flex items-center gap-1">
          <span className={`text-xs font-bold ${trend > 0 ? 'text-red-500' : trend < 0 ? 'text-green-500' : 'text-gray-500'}`}>
            {trend > 0 ? '\u2191' : trend < 0 ? '\u2193' : '\u2192'} {Math.abs(trend).toFixed(3)} &euro;
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`grad-${stationId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2575EA" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#2575EA" stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaD} fill={`url(#grad-${stationId})`} />
        <path d={pathD} fill="none" stroke="#2575EA" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {/* Current price dot */}
        <circle cx={lastPoint.x} cy={lastPoint.y} r={3} fill="#2575EA" stroke="white" strokeWidth={1.5} />
      </svg>

      <div className="flex justify-between mt-2 text-[10px] text-gray-400">
        <span>{new Date(firstPoint.time).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
        <span className="font-medium text-gray-600 dark:text-gray-300">{formatPrice(current)} &euro;</span>
        <span>{new Date(lastPoint.time).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>
      </div>
    </div>
  );
}
