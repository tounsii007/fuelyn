// ============================================================
// Fuelyn — "Best time to fuel" weekday × hour heatmap
//
// Aggregates a stream of price snapshots (or fuel-log entries
// with prices, both share the {price, timestamp} shape) into a
// 7×24 grid of average prices, plus the absolute best/worst
// cells so the UI can highlight them.
//
// The result is fuel-type agnostic — callers pre-filter their
// snapshot list to a single fuel type before passing it in,
// which matches how the existing predictNext24h function works.
// ============================================================

export interface PriceSnapshot {
  /** ISO 8601 timestamp string. */
  readonly timestamp: string;
  /** Price in € per liter. */
  readonly price: number;
}

export interface HeatmapCell {
  /** 0=Mon, 1=Tue … 6=Sun (Mo-first; matches German/EU convention). */
  readonly dayOfWeek: number;
  /** 0–23 hour. */
  readonly hour: number;
  /** Mean price in this cell, or null when no samples landed here. */
  readonly avgPrice: number | null;
  /** Number of snapshots that fell into this cell. */
  readonly count: number;
}

export interface BestTimeHeatmap {
  /** 7×24 cells in row-major order (cells[dow][hour]). */
  readonly cells: readonly (readonly HeatmapCell[])[];
  /** Lowest avg-price cell across the grid (null when no data). */
  readonly bestCell: HeatmapCell | null;
  /** Highest avg-price cell across the grid (null when no data). */
  readonly worstCell: HeatmapCell | null;
  /** Mean over all cells with data. */
  readonly globalMean: number | null;
  /** Total number of snapshots that fed into the grid. */
  readonly sampleCount: number;
  /**
   * 0–1 confidence in the per-cell averages. Drops when:
   *   - Few samples per cell (sparsity)
   *   - Lots of empty cells (uneven coverage)
   *   - Total sample count is small
   */
  readonly confidence: number;
}

const HOURS = 24;
const DAYS = 7;

/**
 * Convert JS Date.getUTCDay (Sun=0…Sat=6) to Mo-first index
 * (Mon=0…Sun=6) which matches every German UI convention.
 *
 * UTC chosen on purpose: snapshot timestamps come from the
 * backend (UTC) and using UTC here means the heatmap is
 * timezone-stable — same "Wednesday 10:00" cell whether the
 * user is in Berlin, Lisbon, or behind a server tz=UTC.
 * Local-time displays are an UI-side concern.
 */
function moFirstUtc(d: Date): number {
  const js = d.getUTCDay();
  return js === 0 ? 6 : js - 1;
}

/**
 * Empty grid with no data. Cells still carry a stable shape so
 * the UI can render a 7×24 "no data yet" state without branching.
 */
function emptyGrid(): readonly (readonly HeatmapCell[])[] {
  const grid: HeatmapCell[][] = [];
  for (let dow = 0; dow < DAYS; dow++) {
    const row: HeatmapCell[] = [];
    for (let h = 0; h < HOURS; h++) {
      row.push({ dayOfWeek: dow, hour: h, avgPrice: null, count: 0 });
    }
    grid.push(row);
  }
  return grid;
}

export function buildBestTimeHeatmap(
  snapshots: readonly PriceSnapshot[],
): BestTimeHeatmap {
  // Initialise empty grid + per-cell sum/count buffers.
  const sums: number[][] = Array.from({ length: DAYS }, () => new Array(HOURS).fill(0));
  const counts: number[][] = Array.from({ length: DAYS }, () => new Array(HOURS).fill(0));

  let total = 0;
  let totalCount = 0;

  for (const s of snapshots) {
    if (!Number.isFinite(s.price) || s.price <= 0 || s.price > 10) continue;
    const t = Date.parse(s.timestamp);
    if (!Number.isFinite(t)) continue;
    const d = new Date(t);
    const dow = moFirstUtc(d);
    const hour = d.getUTCHours();
    sums[dow]![hour]! += s.price;
    counts[dow]![hour]! += 1;
    total += s.price;
    totalCount += 1;
  }

  if (totalCount === 0) {
    return {
      cells: emptyGrid(),
      bestCell: null,
      worstCell: null,
      globalMean: null,
      sampleCount: 0,
      confidence: 0,
    };
  }

  let bestCell: HeatmapCell | null = null;
  let worstCell: HeatmapCell | null = null;
  let cellsWithData = 0;

  const cells: HeatmapCell[][] = [];
  for (let dow = 0; dow < DAYS; dow++) {
    const row: HeatmapCell[] = [];
    for (let h = 0; h < HOURS; h++) {
      const c = counts[dow]![h]!;
      const cell: HeatmapCell = {
        dayOfWeek: dow,
        hour: h,
        avgPrice: c > 0 ? Math.round((sums[dow]![h]! / c) * 1000) / 1000 : null,
        count: c,
      };
      row.push(cell);
      if (cell.avgPrice != null) {
        cellsWithData++;
        if (!bestCell || cell.avgPrice < bestCell.avgPrice!) bestCell = cell;
        if (!worstCell || cell.avgPrice > worstCell.avgPrice!) worstCell = cell;
      }
    }
    cells.push(row);
  }

  const globalMean = Math.round((total / totalCount) * 1000) / 1000;

  // Confidence rubric:
  //   - coverage = cellsWithData / 168 (max possible cells)
  //   - density  = totalCount / cellsWithData (avg samples/cell)
  //   - sample-size factor = min(1, totalCount/200) (200 ≈ 1 day×7 days×~3 reads/hr)
  //
  // Final confidence is the geometric mean of the three components,
  // bounded [0,1]. Geometric mean penalises any single weak signal.
  const TOTAL_CELLS = DAYS * HOURS;
  const coverage = cellsWithData / TOTAL_CELLS;
  const density = cellsWithData > 0 ? totalCount / cellsWithData : 0;
  const densityFactor = Math.min(1, density / 5); // 5 samples/cell = saturated
  const sampleFactor = Math.min(1, totalCount / 200);
  const product = coverage * densityFactor * sampleFactor;
  // Cube root because we're combining three [0,1] factors.
  const confidence = Math.round(Math.pow(product, 1 / 3) * 100) / 100;

  return {
    cells,
    bestCell,
    worstCell,
    globalMean,
    sampleCount: totalCount,
    confidence,
  };
}
