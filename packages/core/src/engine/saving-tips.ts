// ============================================================
// Fuelyn — Personalized saving tips
//
// Inspects the user's fuel log + market history and generates a
// short list of actionable, personalised tips like:
//   "Du tankst meistens Mittwoch 18 Uhr. Probier mal Donnerstag
//    7 Uhr — 4 ct/L günstiger."
//
// Each tip carries:
//   - id          stable for i18n + telemetry
//   - severity    'high' | 'medium' | 'low' (UI tone)
//   - estimatedSavingsEurPerYear  concrete € amount
//   - context     numeric facts the UI substitutes into the
//                 localised template ("{currentDay}", "{betterHour}")
//
// Pure derivation, no I/O.
// ============================================================

import type { FuelLogEntry, FuelType } from '../domain/types';
import type { PriceSnapshot } from './best-time-heatmap';
import { buildBestTimeHeatmap } from './best-time-heatmap';

export type TipSeverity = 'high' | 'medium' | 'low';

export interface SavingTip {
  id: string;
  severity: TipSeverity;
  /**
   * € the user could save per year if they followed the tip.
   * Estimated by extrapolating their past consumption pattern.
   */
  estimatedSavingsEurPerYear: number;
  /**
   * Free-form context dictionary. Keys are stable; the UI's
   * t('savingTips.<id>.body') template substitutes them.
   */
  context: Record<string, string | number>;
}

export interface SavingTipsResult {
  tips: SavingTip[];
  /** 0–1 confidence in the tips overall — drops with sparse data. */
  confidence: number;
}

interface Ctx {
  log: readonly FuelLogEntry[];
  market: readonly (PriceSnapshot & { fuelType?: FuelType })[];
  // Most-common fuel type — drives heatmap scoping
  primaryFuel: FuelType | null;
  totalLiters: number;
  totalCost: number;
  /** Estimated total annual liters via 365-day extrapolation. */
  annualLitersEstimate: number;
}

function buildCtx(log: readonly FuelLogEntry[], market: readonly PriceSnapshot[]): Ctx {
  const fuelCounts = new Map<FuelType, number>();
  let totalLiters = 0;
  let totalCost = 0;
  let earliestTs = Infinity;
  let latestTs = -Infinity;

  for (const e of log) {
    if (!Number.isFinite(e.liters) || e.liters <= 0) continue;
    totalLiters += e.liters;
    totalCost += e.totalCost;
    fuelCounts.set(e.fuelType, (fuelCounts.get(e.fuelType) ?? 0) + 1);
    const ts = Date.parse(e.date);
    if (Number.isFinite(ts)) {
      if (ts < earliestTs) earliestTs = ts;
      if (ts > latestTs) latestTs = ts;
    }
  }

  const primaryFuel: FuelType | null = (() => {
    let best: FuelType | null = null;
    let bestN = 0;
    for (const [ft, n] of fuelCounts) {
      if (n > bestN) {
        best = ft;
        bestN = n;
      }
    }
    return best;
  })();

  // Annualise consumption: scale total liters to 365 days.
  let annualLitersEstimate = 0;
  if (latestTs > earliestTs) {
    const days = (latestTs - earliestTs) / (24 * 3600 * 1000);
    if (days > 0 && totalLiters > 0) {
      annualLitersEstimate = (totalLiters / days) * 365;
    }
  }

  return {
    log,
    market: market as Ctx['market'],
    primaryFuel,
    totalLiters,
    totalCost,
    annualLitersEstimate,
  };
}

/**
 * Tip 1: hour-of-day mismatch.
 * If the user's most-common fill hour is meaningfully more
 * expensive than the cheapest hour in the heatmap, surface a
 * "switch to hour X" tip.
 */
function tipHourOfDay(ctx: Ctx): SavingTip | null {
  if (!ctx.primaryFuel) return null;
  const fuelMarket = ctx.market.filter((s) => !s.fuelType || s.fuelType === ctx.primaryFuel);
  if (fuelMarket.length < 50) return null;

  const heatmap = buildBestTimeHeatmap(fuelMarket);
  if (!heatmap.bestCell || !heatmap.worstCell) return null;
  if (heatmap.confidence < 0.2) return null;

  // User's most-common fill hour
  const hourCounts = new Array<number>(24).fill(0);
  for (const e of ctx.log) {
    if (e.fuelType !== ctx.primaryFuel) continue;
    const h = new Date(e.date).getUTCHours();
    if (Number.isFinite(h)) hourCounts[h] = (hourCounts[h] ?? 0) + 1;
  }
  const userHour = hourCounts.indexOf(Math.max(...hourCounts));
  if (userHour < 0) return null;

  // Find the average price for that hour across the heatmap
  const userHourCells = heatmap.cells
    .map((row) => row[userHour])
    .filter((c): c is NonNullable<typeof c> => c != null && c.avgPrice != null);
  if (userHourCells.length === 0) return null;
  const userHourAvg =
    userHourCells.reduce((s, c) => s + (c.avgPrice ?? 0), 0) / userHourCells.length;

  const bestPrice = heatmap.bestCell.avgPrice ?? 0;
  const savingsPerLiter = userHourAvg - bestPrice;

  // Below 1 ct difference = noise
  if (savingsPerLiter < 0.01) return null;

  const annualSavings = Math.round(savingsPerLiter * ctx.annualLitersEstimate * 100) / 100;
  const severity: TipSeverity = savingsPerLiter > 0.04 ? 'high' : savingsPerLiter > 0.02 ? 'medium' : 'low';

  return {
    id: 'switch-hour',
    severity,
    estimatedSavingsEurPerYear: annualSavings,
    context: {
      currentHour: userHour,
      betterHour: heatmap.bestCell.hour,
      ctPerL: Math.round(savingsPerLiter * 100),
    },
  };
}

/**
 * Tip 2: weekday mismatch.
 * Same shape as tip 1 but for day-of-week.
 */
function tipDayOfWeek(ctx: Ctx): SavingTip | null {
  if (!ctx.primaryFuel) return null;
  const fuelMarket = ctx.market.filter((s) => !s.fuelType || s.fuelType === ctx.primaryFuel);
  if (fuelMarket.length < 50) return null;

  const heatmap = buildBestTimeHeatmap(fuelMarket);
  if (!heatmap.bestCell) return null;
  if (heatmap.confidence < 0.2) return null;

  const dayCounts = new Array<number>(7).fill(0);
  for (const e of ctx.log) {
    if (e.fuelType !== ctx.primaryFuel) continue;
    const js = new Date(e.date).getUTCDay();
    const dow = js === 0 ? 6 : js - 1;
    dayCounts[dow] = (dayCounts[dow] ?? 0) + 1;
  }
  const userDay = dayCounts.indexOf(Math.max(...dayCounts));
  if (userDay < 0) return null;

  // Average price for the user's most-common day across all hours
  const userDayCells = (heatmap.cells[userDay] ?? []).filter(
    (c): c is NonNullable<typeof c> => c != null && c.avgPrice != null,
  );
  if (userDayCells.length === 0) return null;
  const userDayAvg =
    userDayCells.reduce((s, c) => s + (c.avgPrice ?? 0), 0) / userDayCells.length;

  // Best whole-day (averaged) day
  let bestDayAvg = Infinity;
  let bestDay = userDay;
  for (let d = 0; d < 7; d++) {
    const cells = (heatmap.cells[d] ?? []).filter(
      (c): c is NonNullable<typeof c> => c != null && c.avgPrice != null,
    );
    if (cells.length === 0) continue;
    const avg = cells.reduce((s, c) => s + (c.avgPrice ?? 0), 0) / cells.length;
    if (avg < bestDayAvg) {
      bestDayAvg = avg;
      bestDay = d;
    }
  }

  if (bestDay === userDay) return null;
  const savingsPerLiter = userDayAvg - bestDayAvg;
  if (savingsPerLiter < 0.01) return null;

  const annualSavings = Math.round(savingsPerLiter * ctx.annualLitersEstimate * 100) / 100;
  const severity: TipSeverity = savingsPerLiter > 0.04 ? 'high' : savingsPerLiter > 0.02 ? 'medium' : 'low';

  return {
    id: 'switch-day',
    severity,
    estimatedSavingsEurPerYear: annualSavings,
    context: {
      currentDay: userDay,
      betterDay: bestDay,
      ctPerL: Math.round(savingsPerLiter * 100),
    },
  };
}

/**
 * Tip 3: brand concentration.
 * If >70 % of fills are at one expensive brand, suggest
 * comparing prices before each fill instead of brand-loyalty.
 */
function tipBrandLoyalty(ctx: Ctx): SavingTip | null {
  if (ctx.log.length < 10) return null;
  const brandCounts = new Map<string, number>();
  let priceSum = 0;
  let priceCount = 0;
  for (const e of ctx.log) {
    if (!e.stationBrand) continue;
    brandCounts.set(e.stationBrand, (brandCounts.get(e.stationBrand) ?? 0) + 1);
    priceSum += e.pricePerLiter;
    priceCount++;
  }
  if (brandCounts.size === 0 || priceCount === 0) return null;
  const userAvgPrice = priceSum / priceCount;

  let topBrand: string | null = null;
  let topShare = 0;
  for (const [brand, count] of brandCounts) {
    const share = count / ctx.log.length;
    if (share > topShare) {
      topShare = share;
      topBrand = brand;
    }
  }
  if (!topBrand || topShare < 0.7) return null;

  // Estimated savings: assume the user would save ~3 ct/L by
  // comparing 3 stations per fill (conservative German-market
  // mid-range spread). Empirical benchmark from the existing
  // BestDealCard logic.
  const assumedCtSavingsPerL = 0.03;
  const annualSavings = Math.round(assumedCtSavingsPerL * ctx.annualLitersEstimate * 100) / 100;

  return {
    id: 'compare-stations',
    severity: 'medium',
    estimatedSavingsEurPerYear: annualSavings,
    context: {
      brand: topBrand,
      sharePct: Math.round(topShare * 100),
      avgPriceEur: Math.round(userAvgPrice * 1000) / 1000,
    },
  };
}

/**
 * Tip 4: filter to higher-octane / cleaner fuel for hybrid users.
 * If the user's vehicle profile (when supplied externally) suggests
 * Diesel but they fill Super, surface a quick wrong-fuel hint.
 *
 * Currently skipped — vehicle profile is in Zustand, this engine
 * is profile-agnostic by design. UI can layer that on top.
 */

const TIP_FUNCTIONS: ((ctx: Ctx) => SavingTip | null)[] = [
  tipHourOfDay,
  tipDayOfWeek,
  tipBrandLoyalty,
];

export interface SavingTipsInputs {
  log: readonly FuelLogEntry[];
  market: readonly PriceSnapshot[];
  /** Cap on tips returned (default 3 — enough for a card stack). */
  maxTips?: number;
}

export function computeSavingTips(inputs: SavingTipsInputs): SavingTipsResult {
  const ctx = buildCtx(inputs.log, inputs.market);
  const max = inputs.maxTips ?? 3;

  if (ctx.log.length < 5) {
    return { tips: [], confidence: Math.min(0.4, ctx.log.length / 12) };
  }

  const allTips: SavingTip[] = [];
  for (const fn of TIP_FUNCTIONS) {
    const t = fn(ctx);
    if (t) allTips.push(t);
  }

  // Sort by severity then estimated savings descending so the
  // most actionable tip appears first.
  const severityRank: Record<TipSeverity, number> = { high: 3, medium: 2, low: 1 };
  allTips.sort((a, b) => {
    const sev = severityRank[b.severity] - severityRank[a.severity];
    if (sev !== 0) return sev;
    return b.estimatedSavingsEurPerYear - a.estimatedSavingsEurPerYear;
  });

  const confidence = Math.min(1, ctx.log.length / 20);

  return {
    tips: allTips.slice(0, max),
    confidence,
  };
}
