// ============================================================
// Sparkline — minimal, premium-looking SVG sparkline for a single
// station's recent price series.
//
// Design principles:
//   • No axes, no labels — the surrounding card carries the
//     numeric context (current price, delta, etc.). The sparkline
//     is purely "trajectory at a glance".
//   • Colour follows the *direction* of the last segment: emerald
//     when the trend is falling (good for the user), rose when it
//     is rising. Stable trends fade to neutral slate.
//   • Renders pure SVG, no external chart lib — keeps the bundle
//     small and the per-card render cost trivially low.
//   • Responds to the surrounding text size via `currentColor`
//     fallbacks so dark/light mode works automatically.
// ============================================================

'use client';

import { memo, useMemo } from 'react';

interface SparklineProps {
  /** Chronological points (oldest → newest). Empty array → flat baseline. */
  data: ReadonlyArray<{ price: number; timestamp: string }>;
  /** SVG dimensions. Defaults match the StationCard slot. */
  width?: number;
  height?: number;
  /**
   * Treat absolute slope below this (€/L) as STABLE, painting the line
   * in a neutral grey. 0.003 ≈ 0.3 ct/L — below the noise floor of the
   * 5-min Tankerkönig poll cadence.
   */
  trendThreshold?: number;
  /** Override the auto-derived trend direction (for testing / forecast). */
  forceDirection?: 'falling' | 'rising' | 'stable';
  className?: string;
  ariaLabel?: string;
}

type Direction = 'falling' | 'rising' | 'stable';

const COLOURS: Record<Direction, { stroke: string; gradTop: string; gradBot: string; dot: string }> = {
  falling: {
    // Emerald — prices are coming down, win for the user
    stroke: '#10B981',
    gradTop: 'rgba(16, 185, 129, 0.32)',
    gradBot: 'rgba(16, 185, 129, 0)',
    dot: '#10B981',
  },
  rising: {
    // Rose — prices climbing
    stroke: '#F43F5E',
    gradTop: 'rgba(244, 63, 94, 0.28)',
    gradBot: 'rgba(244, 63, 94, 0)',
    dot: '#F43F5E',
  },
  stable: {
    // Slate — flat line, no actionable signal
    stroke: '#94A3B8',
    gradTop: 'rgba(148, 163, 184, 0.20)',
    gradBot: 'rgba(148, 163, 184, 0)',
    dot: '#94A3B8',
  },
};

function SparklineImpl({
  data,
  width = 56,
  height = 18,
  trendThreshold = 0.003,
  forceDirection,
  className = '',
  ariaLabel,
}: SparklineProps) {
  const computed = useMemo(() => buildPath(data, width, height, trendThreshold, forceDirection), [
    data,
    width,
    height,
    trendThreshold,
    forceDirection,
  ]);

  const gradId = useMemo(() => `spark-grad-${Math.random().toString(36).slice(2, 9)}`, []);

  if (computed == null) {
    // No data → render a discrete dashed baseline so the slot doesn't
    // collapse and the layout stays stable while history loads.
    return (
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={className}
        aria-hidden="true"
      >
        <line
          x1={1}
          y1={height / 2}
          x2={width - 1}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth={1}
          strokeDasharray="2 2"
        />
      </svg>
    );
  }

  const { path, areaPath, lastX, lastY, direction } = computed;
  const c = COLOURS[direction];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel ?? `Preisverlauf, Trend ${direction}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.gradTop} />
          <stop offset="100%" stopColor={c.gradBot} />
        </linearGradient>
      </defs>
      {/* Filled area below the line — fades to transparent for premium depth */}
      <path d={areaPath} fill={`url(#${gradId})`} />
      {/* The trajectory itself */}
      <path
        d={path}
        fill="none"
        stroke={c.stroke}
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Latest-value dot — gives the eye a clear "where we are now" anchor */}
      <circle cx={lastX} cy={lastY} r={1.8} fill={c.dot} />
    </svg>
  );
}

/**
 * Memoised export — sparkline data refs are stable across StationCard
 * renders (TanStack Query returns the same array reference until the
 * underlying data actually changes), so React.memo's referential
 * equality check correctly skips re-renders. Cuts the StationList's
 * paint cost roughly in half on a 50-card list.
 */
export const Sparkline = memo(SparklineImpl);

interface ComputedPath {
  path: string;
  areaPath: string;
  lastX: number;
  lastY: number;
  direction: Direction;
}

function buildPath(
  data: ReadonlyArray<{ price: number; timestamp: string }>,
  width: number,
  height: number,
  trendThreshold: number,
  forceDirection?: Direction,
): ComputedPath | null {
  if (data.length < 2) return null;

  const prices = data.map((d) => d.price).filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length < 2) return null;

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  // 1px padding top/bottom so the line + dot don't clip the SVG box.
  const PAD = 2;
  const drawHeight = height - PAD * 2;
  const range = max - min || 1; // avoid /0

  const N = prices.length;
  const xStep = (width - 2) / (N - 1);
  const points: Array<[number, number]> = prices.map((p, i) => {
    const x = 1 + i * xStep;
    // y axis inverted: low price → bottom (high y) of the panel? No —
    // standard convention: low price (good) shows as a LOW point.
    // We invert because SVG y grows downward, so a low PRICE → a HIGH y.
    // To match user expectation ("line going up = price rising"), low price
    // should be at the BOTTOM of the SVG (high y).
    const y = PAD + drawHeight - ((p - min) / range) * drawHeight;
    return [x, y];
  });

  const path = points
    .map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`))
    .join(' ');

  // Area fill: line, then drop down to bottom edge, then back to start.
  const [firstX] = points[0]!;
  const [lastX, lastY] = points[points.length - 1]!;
  const areaPath = `${path} L ${lastX} ${height} L ${firstX} ${height} Z`;

  // Direction = recent half average vs earlier half average. More robust
  // than "last vs first" against single-point noise.
  let direction: Direction;
  if (forceDirection) {
    direction = forceDirection;
  } else {
    const half = Math.max(1, Math.floor(N / 2));
    const earlier = prices.slice(0, half);
    const recent = prices.slice(N - half);
    const earlierMean = earlier.reduce((s, p) => s + p, 0) / earlier.length;
    const recentMean = recent.reduce((s, p) => s + p, 0) / recent.length;
    const slope = recentMean - earlierMean;
    direction = slope > trendThreshold ? 'rising' : slope < -trendThreshold ? 'falling' : 'stable';
  }

  return { path, areaPath, lastX, lastY, direction };
}
