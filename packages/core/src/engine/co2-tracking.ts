// ============================================================
// Fuelyn — CO₂ tracking from fuel-log entries
//
// Builds month-by-month CO₂ aggregates from a FuelLogEntry[]
// log so the UI can render a time series.
//
// CO₂ factors (kg CO₂ per liter, well-to-wheel basis matching
// the German "UBA WtW" methodology that Fuelyn's Wrapped slide
// already uses):
//
//   Diesel:    2.65 kg/L
//   Super E5:  2.32 kg/L (5% bio-ethanol)
//   Super E10: 2.21 kg/L (10% bio-ethanol)
//
// Sources:
//   - Umweltbundesamt (UBA) "ProBas" database, well-to-wheel
//   - IEA WtW factors for blended fuels
//   These are the same constants the existing Wrapped engine
//   uses, exposed here as a re-importable single source of
//   truth so future changes don't drift.
// ============================================================

import type { FuelLogEntry, FuelType } from '../domain/types';

export const CO2_FACTOR_KG_PER_LITER: Record<FuelType, number> = {
  diesel: 2.65,
  e5: 2.32,
  e10: 2.21,
};

export interface MonthlyCo2Bucket {
  /** YYYY-MM. Sortable as a string. */
  ymKey: string;
  /** 1900-based year. */
  year: number;
  /** 0-indexed month (matches Date.getMonth). */
  month: number;
  /** Total liters fueled in this month (across all fuel types). */
  liters: number;
  /** Total CO₂ kg emitted from those liters. */
  co2Kg: number;
  /** Total cost spent in this month. */
  costEur: number;
  /** Number of fuel-log entries in this bucket. */
  entries: number;
  /** Per-fuel breakdown so the chart can stack diesel/e5/e10. */
  byFuel: Record<FuelType, { liters: number; co2Kg: number }>;
}

export interface Co2Summary {
  /** Newest-first list of monthly buckets. */
  monthly: MonthlyCo2Bucket[];
  /** Lifetime CO₂ emitted from the entire log. */
  totalCo2Kg: number;
  /** Lifetime liters consumed. */
  totalLiters: number;
  /** "Equivalent number of trees" (1 tree absorbs ~22 kg/year). */
  treeYearsEquivalent: number;
  /** Per-fuel-type lifetime breakdown for pie/bar charts. */
  byFuel: Record<FuelType, { liters: number; co2Kg: number; share: number }>;
  /**
   * 30-day rolling average for the trend chip ("X kg/month").
   * Null when there are fewer than 30 days of data.
   */
  rolling30dKg: number | null;
}

/**
 * Compute CO₂ kg from a single log entry.
 */
export function entryCo2Kg(entry: FuelLogEntry): number {
  const factor = CO2_FACTOR_KG_PER_LITER[entry.fuelType];
  if (!Number.isFinite(factor) || !Number.isFinite(entry.liters)) return 0;
  return Math.round(entry.liters * factor * 100) / 100;
}

/**
 * Empty summary placeholder so callers can avoid `null` checks.
 * Used when the log is empty.
 */
function emptySummary(): Co2Summary {
  return {
    monthly: [],
    totalCo2Kg: 0,
    totalLiters: 0,
    treeYearsEquivalent: 0,
    byFuel: {
      diesel: { liters: 0, co2Kg: 0, share: 0 },
      e5: { liters: 0, co2Kg: 0, share: 0 },
      e10: { liters: 0, co2Kg: 0, share: 0 },
    },
    rolling30dKg: null,
  };
}

function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Aggregate a fuel-log into monthly CO₂ buckets + lifetime
 * roll-ups. Pure function: no I/O, deterministic, tested in
 * isolation.
 *
 * `now` is parametrised so the rolling-30d calculation is
 * deterministic in tests.
 */
export function summarizeCo2(
  log: readonly FuelLogEntry[],
  now: Date = new Date(),
): Co2Summary {
  if (log.length === 0) return emptySummary();

  const buckets = new Map<string, MonthlyCo2Bucket>();
  const fuelTotals: Record<FuelType, { liters: number; co2Kg: number }> = {
    diesel: { liters: 0, co2Kg: 0 },
    e5: { liters: 0, co2Kg: 0 },
    e10: { liters: 0, co2Kg: 0 },
  };
  let totalLiters = 0;
  let totalCo2 = 0;
  let recentCo2 = 0;
  let hasRecent = false;

  const cutoff = now.getTime() - 30 * 24 * 3600 * 1000;
  // We also need to know whether the user actually HAS ≥30 days
  // of history before reporting a rolling average — otherwise
  // the per-day extrapolation skews wildly for new users.
  let oldestEntryTs = Infinity;

  for (const e of log) {
    const ts = Date.parse(e.date);
    if (!Number.isFinite(ts)) continue;
    if (!Number.isFinite(e.liters) || e.liters <= 0) continue;

    const co2 = entryCo2Kg(e);
    const d = new Date(ts);
    const key = ymKey(d);

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        ymKey: key,
        year: d.getFullYear(),
        month: d.getMonth(),
        liters: 0,
        co2Kg: 0,
        costEur: 0,
        entries: 0,
        byFuel: {
          diesel: { liters: 0, co2Kg: 0 },
          e5: { liters: 0, co2Kg: 0 },
          e10: { liters: 0, co2Kg: 0 },
        },
      };
      buckets.set(key, bucket);
    }
    bucket.liters += e.liters;
    bucket.co2Kg += co2;
    bucket.costEur += e.totalCost;
    bucket.entries += 1;
    bucket.byFuel[e.fuelType].liters += e.liters;
    bucket.byFuel[e.fuelType].co2Kg += co2;

    fuelTotals[e.fuelType].liters += e.liters;
    fuelTotals[e.fuelType].co2Kg += co2;
    totalLiters += e.liters;
    totalCo2 += co2;

    if (ts < oldestEntryTs) oldestEntryTs = ts;
    if (ts >= cutoff) {
      recentCo2 += co2;
      hasRecent = true;
    }
  }

  // Finalize per-month rounding — tests expect 2 decimals.
  for (const b of buckets.values()) {
    b.liters = Math.round(b.liters * 100) / 100;
    b.co2Kg = Math.round(b.co2Kg * 100) / 100;
    b.costEur = Math.round(b.costEur * 100) / 100;
  }

  const monthly = [...buckets.values()].sort((a, b) =>
    b.ymKey.localeCompare(a.ymKey),
  );

  // Rolling 30d average — only meaningful when ≥30 days of
  // history exist. Below that, return null so the UI can hide
  // the chip rather than show a misleading single-data-point
  // extrapolation.
  const daysOfHistory = (now.getTime() - oldestEntryTs) / (24 * 3600 * 1000);
  const rolling30dKg =
    hasRecent && daysOfHistory >= 30 ? Math.round(recentCo2 * 100) / 100 : null;

  // Per-fuel shares.
  const byFuel: Co2Summary['byFuel'] = {
    diesel: { ...fuelTotals.diesel, share: 0 },
    e5: { ...fuelTotals.e5, share: 0 },
    e10: { ...fuelTotals.e10, share: 0 },
  };
  if (totalCo2 > 0) {
    byFuel.diesel.share = Math.round((byFuel.diesel.co2Kg / totalCo2) * 1000) / 1000;
    byFuel.e5.share = Math.round((byFuel.e5.co2Kg / totalCo2) * 1000) / 1000;
    byFuel.e10.share = Math.round((byFuel.e10.co2Kg / totalCo2) * 1000) / 1000;
  }

  return {
    monthly,
    totalCo2Kg: Math.round(totalCo2 * 100) / 100,
    totalLiters: Math.round(totalLiters * 100) / 100,
    treeYearsEquivalent: Math.round(totalCo2 / 22),
    byFuel,
    rolling30dKg,
  };
}
