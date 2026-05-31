// ============================================================
// Year-in-Review compute — pure, side-effect-free.
//
// Aggregates a user's FuelLogEntry[] (and optional priceHistory) into
// a structured WrappedReport that the UI renders as a Spotify-Wrapped
// style story. No DOM, no React, no I/O — easily unit-tested and
// runnable on the server for cross-device sharing.
// ============================================================

import type { FuelLogEntry, FuelType } from '../domain/types';

// ─── Types ─────────────────────────────────────────────────

export interface WrappedPriceSnapshot {
  readonly stationId: string;
  readonly fuelType: string;
  readonly price: number;
  readonly timestamp: string;
}

/** Tuning knobs for CO₂ + savings calculation. */
export interface WrappedConfig {
  /** kg CO₂ per liter for each fuel type. (DE BAFA 2024 reference values.) */
  co2PerLiter: Record<FuelType, number>;
  /** Bottom percentile of prices considered "cheap days" for the savings stat. */
  cheapPercentile: number;
}

export const DEFAULT_WRAPPED_CONFIG: WrappedConfig = {
  // BAFA / UBA Well-to-Wheel approximations (kg CO₂ per liter)
  co2PerLiter: { e10: 2.21, e5: 2.32, diesel: 2.65 },
  cheapPercentile: 0.25,
};

export interface BrandTally {
  readonly brand: string;
  readonly visits: number;
  readonly totalEur: number;
  readonly totalLiters: number;
}

export interface DayOfWeekTally {
  /** 0 = Sonntag, 1 = Montag … 6 = Samstag */
  readonly dayIndex: number;
  readonly label: string;
  readonly avgPricePerLiter: number;
  readonly visits: number;
}

export interface WrappedHighlight {
  readonly id: string;
  readonly entry: FuelLogEntry;
  readonly headline: string;
}

export interface WrappedReport {
  /** Calendar year covered, e.g. 2025. */
  readonly year: number;
  /** Whether the user has enough data to render a meaningful story. */
  readonly hasMinimumData: boolean;

  // Top-level totals
  readonly totals: {
    readonly entries: number;
    readonly liters: number;
    readonly eur: number;
    readonly co2Kg: number;
    readonly distinctStations: number;
    readonly distinctBrands: number;
  };

  // Averages
  readonly averages: {
    readonly pricePerLiter: number;
    readonly costPerVisit: number;
    readonly litersPerVisit: number;
  };

  // Distance (best-effort: from odometer deltas if present)
  readonly distance: {
    readonly km: number;
    readonly avgConsumptionLPer100Km: number | null;
  };

  // Best & worst tank-ups
  readonly highlights: {
    readonly cheapest: WrappedHighlight | null;
    readonly mostExpensive: WrappedHighlight | null;
    readonly biggestFillUp: WrappedHighlight | null;
  };

  // Top brand
  readonly topBrand: BrandTally | null;

  // Day-of-week pattern (sorted by avg price ascending)
  readonly dayOfWeekPattern: ReadonlyArray<DayOfWeekTally>;

  // "If you had always paid market average, you would have paid X more (or saved X)"
  readonly savingsVsAverage: {
    readonly marketAvgPricePerLiter: number;
    readonly diffEur: number;
    readonly diffPercent: number;
    /** If positive: user PAID more than avg. If negative: user SAVED. */
  };

  // Streaks
  readonly streaks: {
    readonly longestGapDays: number;
    readonly mostFrequentMonth: { readonly month: number; readonly visits: number } | null;
  };
}

// ─── Constants ─────────────────────────────────────────────

const DAY_NAMES_DE = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
] as const;

const MIN_ENTRIES_FOR_STORY = 3;

// ─── Compute ───────────────────────────────────────────────

export interface WrappedInput {
  readonly entries: ReadonlyArray<FuelLogEntry>;
  readonly priceHistory?: ReadonlyArray<WrappedPriceSnapshot>;
  readonly year?: number;
  readonly config?: Partial<WrappedConfig>;
}

export function computeWrapped(input: WrappedInput): WrappedReport {
  const cfg: WrappedConfig = { ...DEFAULT_WRAPPED_CONFIG, ...(input.config ?? {}) };
  const targetYear = input.year ?? new Date().getFullYear();

  const entries = input.entries.filter((e) => isInYear(e.date, targetYear));

  if (entries.length < MIN_ENTRIES_FOR_STORY) {
    return emptyReport(targetYear);
  }

  // Totals
  const totals = computeTotals(entries, cfg);

  // Averages
  const averages = {
    pricePerLiter: round(totals.eur / Math.max(0.001, totals.liters), 3),
    costPerVisit: round(totals.eur / entries.length, 2),
    litersPerVisit: round(totals.liters / entries.length, 1),
  };

  // Distance from odometer deltas
  const distance = computeDistance(entries, totals.liters);

  // Highlights
  const cheapest = findExtreme(entries, (e) => e.pricePerLiter, 'min');
  const mostExpensive = findExtreme(entries, (e) => e.pricePerLiter, 'max');
  const biggestFillUp = findExtreme(entries, (e) => e.liters, 'max');

  // Brand tally
  const brandMap = tallyBrands(entries);
  const topBrand = pickTopBrand(brandMap);

  // Day-of-week pattern
  const dayOfWeekPattern = computeDayOfWeekPattern(entries);

  // Savings vs. market average (priceHistory + own log)
  const savingsVsAverage = computeSavingsVsAverage(entries, input.priceHistory ?? []);

  // Streaks
  const streaks = computeStreaks(entries);

  return {
    year: targetYear,
    hasMinimumData: true,
    totals,
    averages,
    distance,
    highlights: {
      cheapest: cheapest && {
        id: 'cheapest',
        entry: cheapest,
        headline: `Dein günstigster Tankstopp: ${formatPrice(cheapest.pricePerLiter)} bei ${cheapest.stationBrand}`,
      },
      mostExpensive: mostExpensive && {
        id: 'mostExpensive',
        entry: mostExpensive,
        headline: `Teuerster Tankstopp: ${formatPrice(mostExpensive.pricePerLiter)} bei ${mostExpensive.stationBrand}`,
      },
      biggestFillUp: biggestFillUp && {
        id: 'biggestFillUp',
        entry: biggestFillUp,
        headline: `Größter Tank: ${biggestFillUp.liters.toFixed(0)} Liter`,
      },
    },
    topBrand,
    dayOfWeekPattern,
    savingsVsAverage,
    streaks,
  };
}

// ─── Helpers ───────────────────────────────────────────────

function isInYear(iso: string, year: number): boolean {
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getUTCFullYear() === year;
}

function computeTotals(
  entries: ReadonlyArray<FuelLogEntry>,
  cfg: WrappedConfig,
): WrappedReport['totals'] {
  let liters = 0;
  let eur = 0;
  let co2 = 0;
  const stations = new Set<string>();
  const brands = new Set<string>();
  for (const e of entries) {
    liters += e.liters;
    eur += e.totalCost;
    const factor = cfg.co2PerLiter[e.fuelType] ?? 2.3;
    co2 += e.liters * factor;
    if (e.stationName) stations.add(e.stationName.toLowerCase());
    if (e.stationBrand) brands.add(e.stationBrand.toLowerCase());
  }
  return {
    entries: entries.length,
    liters: round(liters, 1),
    eur: round(eur, 2),
    co2Kg: round(co2, 1),
    distinctStations: stations.size,
    distinctBrands: brands.size,
  };
}

function computeDistance(
  entries: ReadonlyArray<FuelLogEntry>,
  totalLiters: number,
): WrappedReport['distance'] {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  const odoEntries = sorted.filter((e): e is FuelLogEntry & { odometer: number } =>
    typeof e.odometer === 'number' && Number.isFinite(e.odometer),
  );
  if (odoEntries.length < 2) {
    return { km: 0, avgConsumptionLPer100Km: null };
  }
  const first = odoEntries[0]!;
  const last = odoEntries[odoEntries.length - 1]!;
  const km = Math.max(0, last.odometer - first.odometer);
  const avgConsumption =
    km > 0 ? round((totalLiters / km) * 100, 1) : null;
  return { km: round(km, 0), avgConsumptionLPer100Km: avgConsumption };
}

function findExtreme(
  entries: ReadonlyArray<FuelLogEntry>,
  pick: (e: FuelLogEntry) => number,
  mode: 'min' | 'max',
): FuelLogEntry | null {
  if (entries.length === 0) return null;
  let best = entries[0]!;
  for (let i = 1; i < entries.length; i++) {
    const e = entries[i]!;
    const v = pick(e);
    const bv = pick(best);
    if ((mode === 'min' && v < bv) || (mode === 'max' && v > bv)) best = e;
  }
  return best;
}

function tallyBrands(entries: ReadonlyArray<FuelLogEntry>): Map<string, BrandTally> {
  const map = new Map<string, BrandTally>();
  for (const e of entries) {
    const key = (e.stationBrand || 'Unbekannt').trim();
    const cur = map.get(key);
    if (cur) {
      map.set(key, {
        brand: cur.brand,
        visits: cur.visits + 1,
        totalEur: cur.totalEur + e.totalCost,
        totalLiters: cur.totalLiters + e.liters,
      });
    } else {
      map.set(key, {
        brand: key,
        visits: 1,
        totalEur: e.totalCost,
        totalLiters: e.liters,
      });
    }
  }
  return map;
}

function pickTopBrand(map: Map<string, BrandTally>): BrandTally | null {
  let top: BrandTally | null = null;
  for (const t of map.values()) {
    if (!top || t.visits > top.visits) top = t;
  }
  return top;
}

function computeDayOfWeekPattern(
  entries: ReadonlyArray<FuelLogEntry>,
): ReadonlyArray<DayOfWeekTally> {
  const buckets: Array<{ sum: number; count: number }> = Array.from({ length: 7 }, () => ({
    sum: 0,
    count: 0,
  }));
  for (const e of entries) {
    const dow = new Date(e.date).getUTCDay();
    const b = buckets[dow]!;
    b.sum += e.pricePerLiter;
    b.count += 1;
  }
  return buckets
    .map(
      (b, idx): DayOfWeekTally => ({
        dayIndex: idx,
        label: DAY_NAMES_DE[idx]!,
        avgPricePerLiter: b.count > 0 ? round(b.sum / b.count, 3) : 0,
        visits: b.count,
      }),
    )
    .filter((d) => d.visits > 0)
    .sort((a, b) => a.avgPricePerLiter - b.avgPricePerLiter);
}

function computeSavingsVsAverage(
  entries: ReadonlyArray<FuelLogEntry>,
  history: ReadonlyArray<WrappedPriceSnapshot>,
): WrappedReport['savingsVsAverage'] {
  // Use a per-fuel-type market average.
  const buckets = new Map<string, { sum: number; count: number }>();
  const source: ReadonlyArray<{ fuelType: string; price: number }> =
    history.length > 0
      ? history
      : entries.map((e) => ({ fuelType: e.fuelType, price: e.pricePerLiter }));
  for (const s of source) {
    const cur = buckets.get(s.fuelType) ?? { sum: 0, count: 0 };
    cur.sum += s.price;
    cur.count += 1;
    buckets.set(s.fuelType, cur);
  }

  let counterfactualEur = 0;
  let realEur = 0;
  for (const e of entries) {
    const b = buckets.get(e.fuelType);
    const marketAvg = b && b.count > 0 ? b.sum / b.count : e.pricePerLiter;
    counterfactualEur += marketAvg * e.liters;
    realEur += e.totalCost;
  }
  const marketAvg =
    Array.from(buckets.values()).reduce((acc, b) => acc + b.sum, 0) /
    Math.max(1, Array.from(buckets.values()).reduce((acc, b) => acc + b.count, 0));
  const diff = round(realEur - counterfactualEur, 2);
  const pct =
    counterfactualEur > 0 ? round((diff / counterfactualEur) * 100, 1) : 0;
  return {
    marketAvgPricePerLiter: round(marketAvg, 3),
    diffEur: diff,
    diffPercent: pct,
  };
}

function computeStreaks(entries: ReadonlyArray<FuelLogEntry>): WrappedReport['streaks'] {
  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  let longestGapDays = 0;
  for (let i = 1; i < sorted.length; i++) {
    const a = new Date(sorted[i - 1]!.date).getTime();
    const b = new Date(sorted[i]!.date).getTime();
    const gap = Math.round((b - a) / 86_400_000);
    if (gap > longestGapDays) longestGapDays = gap;
  }
  const monthMap = new Map<number, number>();
  for (const e of entries) {
    const m = new Date(e.date).getUTCMonth();
    monthMap.set(m, (monthMap.get(m) ?? 0) + 1);
  }
  let topMonth: { month: number; visits: number } | null = null;
  for (const [m, v] of monthMap.entries()) {
    if (!topMonth || v > topMonth.visits) topMonth = { month: m, visits: v };
  }
  return { longestGapDays, mostFrequentMonth: topMonth };
}

function emptyReport(year: number): WrappedReport {
  return {
    year,
    hasMinimumData: false,
    totals: { entries: 0, liters: 0, eur: 0, co2Kg: 0, distinctStations: 0, distinctBrands: 0 },
    averages: { pricePerLiter: 0, costPerVisit: 0, litersPerVisit: 0 },
    distance: { km: 0, avgConsumptionLPer100Km: null },
    highlights: { cheapest: null, mostExpensive: null, biggestFillUp: null },
    topBrand: null,
    dayOfWeekPattern: [],
    savingsVsAverage: { marketAvgPricePerLiter: 0, diffEur: 0, diffPercent: 0 },
    streaks: { longestGapDays: 0, mostFrequentMonth: null },
  };
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function formatPrice(eur: number): string {
  return `${eur.toFixed(3).replace('.', ',')} €`;
}
