// ============================================================
// Fuelyn — Counterfactual: "What would you save with X?"
//
// Replays the user's fuel log under a hypothetical alternative
// (different vehicle, different fuel, different driving habits)
// and reports the cost / CO₂ / savings delta.
//
// Six built-in scenarios:
//   1. switchToHybrid       — assume 30% lower consumption
//   2. switchToEv           — replace fuel cost with kWh cost
//   3. switchToDiesel       — same vehicle, only fuel-type change
//   4. switchToE10          — 5% lower price, 5% higher consumption
//   5. fillAtBestStation    — every fill at the cheapest station
//                             of that day in the user's market window
//   6. fillBefore8am        — every fill shifted to the cheapest
//                             early-morning hour from the heatmap
//
// Each scenario returns the same shape so the UI can render
// them as comparison cards uniformly.
// ============================================================

import type { FuelLogEntry, FuelType } from '../domain/types';
import type { PriceSnapshot } from './best-time-heatmap';
import { CO2_FACTOR_KG_PER_LITER } from './co2-tracking';

export type ScenarioId =
  | 'switch-to-hybrid'
  | 'switch-to-ev'
  | 'switch-to-diesel'
  | 'switch-to-e10'
  | 'fill-at-best-station'
  | 'fill-before-8am';

export interface ScenarioResult {
  id: ScenarioId;
  /** What the user actually paid in € across all fills. */
  actualCostEur: number;
  /** What the same litres would have cost under the scenario. */
  hypotheticalCostEur: number;
  /**
   * Positive = scenario saves money, negative = scenario more
   * expensive. Already rounded to 2 decimals.
   */
  deltaEur: number;
  /** Hypothetical liters under the scenario. */
  hypotheticalLiters: number;
  /** Actual CO₂ kg produced. */
  actualCo2Kg: number;
  /** Hypothetical CO₂ kg under the scenario. */
  hypotheticalCo2Kg: number;
  /** Positive = scenario reduces CO₂. */
  deltaCo2Kg: number;
  /** Number of log entries the scenario could evaluate. */
  evaluatedFills: number;
}

export interface CounterfactualResult {
  scenarios: ScenarioResult[];
  /** Period the analysis spans (earliest → latest fill). */
  spanLabel: { startIso: string; endIso: string };
}

/**
 * Configurable assumptions. Stored as constants so we have a
 * single place to tune them and the tests can pin the math.
 */
export const SCENARIO_PARAMS = {
  hybrid: {
    /** Hybrids realistically save ~30% on consumption WLTP-corrected. */
    consumptionFactor: 0.7,
  },
  ev: {
    /** Conservative German fast-charge tariff: 0.45 €/kWh. */
    pricePerKwh: 0.45,
    /** Mid-size EV uses ~18 kWh/100km. */
    kwhPer100Km: 18,
    /** Diesel L → km via 6 L/100km equivalent (mid-size). */
    kmPerLiterDiesel: 100 / 6,
    /** Petrol L → km via 7 L/100km equivalent. */
    kmPerLiterPetrol: 100 / 7,
    /** EV electricity well-to-wheel CO2 factor (kg/kWh, German mix). */
    co2KgPerKwh: 0.38,
  },
  e10: {
    pricePremiumFactor: 0.985,    // E10 about 1.5% cheaper than E5
    consumptionPenaltyFactor: 1.015, // ~1.5% higher consumption
  },
} as const;

interface Ctx {
  log: readonly FuelLogEntry[];
  market: readonly (PriceSnapshot & { fuelType?: FuelType; stationId?: string })[];
  totalLiters: number;
  totalCost: number;
  totalCo2: number;
  earliestIso: string;
  latestIso: string;
}

function buildCtx(
  log: readonly FuelLogEntry[],
  market: readonly PriceSnapshot[],
): Ctx | null {
  if (log.length === 0) return null;
  let totalLiters = 0;
  let totalCost = 0;
  let totalCo2 = 0;
  let earliest = '9999';
  let latest = '0000';
  for (const e of log) {
    if (!Number.isFinite(e.liters) || e.liters <= 0) continue;
    if (!Number.isFinite(e.totalCost)) continue;
    totalLiters += e.liters;
    totalCost += e.totalCost;
    totalCo2 += e.liters * (CO2_FACTOR_KG_PER_LITER[e.fuelType] ?? 0);
    if (e.date < earliest) earliest = e.date;
    if (e.date > latest) latest = e.date;
  }
  if (totalLiters === 0) return null;
  return {
    log,
    market: market as Ctx['market'],
    totalLiters,
    totalCost,
    totalCo2,
    earliestIso: earliest,
    latestIso: latest,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Scenario implementations ──────────────────────────────

function switchToHybrid(ctx: Ctx): ScenarioResult {
  const factor = SCENARIO_PARAMS.hybrid.consumptionFactor;
  const hypLiters = ctx.totalLiters * factor;
  const hypCost = ctx.totalCost * factor;
  const hypCo2 = ctx.totalCo2 * factor;
  return {
    id: 'switch-to-hybrid',
    actualCostEur: round2(ctx.totalCost),
    hypotheticalCostEur: round2(hypCost),
    deltaEur: round2(ctx.totalCost - hypCost),
    hypotheticalLiters: round2(hypLiters),
    actualCo2Kg: round2(ctx.totalCo2),
    hypotheticalCo2Kg: round2(hypCo2),
    deltaCo2Kg: round2(ctx.totalCo2 - hypCo2),
    evaluatedFills: ctx.log.length,
  };
}

function switchToEv(ctx: Ctx): ScenarioResult {
  const ev = SCENARIO_PARAMS.ev;
  // Map liters → km → kWh via fuel-specific km/L
  let kmTotal = 0;
  for (const e of ctx.log) {
    const kmPerL = e.fuelType === 'diesel' ? ev.kmPerLiterDiesel : ev.kmPerLiterPetrol;
    kmTotal += e.liters * kmPerL;
  }
  const kwh = (kmTotal / 100) * ev.kwhPer100Km;
  const hypCost = kwh * ev.pricePerKwh;
  const hypCo2 = kwh * ev.co2KgPerKwh;
  return {
    id: 'switch-to-ev',
    actualCostEur: round2(ctx.totalCost),
    hypotheticalCostEur: round2(hypCost),
    deltaEur: round2(ctx.totalCost - hypCost),
    hypotheticalLiters: 0, // doesn't apply
    actualCo2Kg: round2(ctx.totalCo2),
    hypotheticalCo2Kg: round2(hypCo2),
    deltaCo2Kg: round2(ctx.totalCo2 - hypCo2),
    evaluatedFills: ctx.log.length,
  };
}

function switchToDiesel(ctx: Ctx): ScenarioResult {
  // Diesel ≈ 12 ct/L cheaper than E5 in Germany historically,
  // and consumption is ~85% of petrol.
  const dieselDiscount = 0.12;
  const consumptionFactor = 0.85;

  let hypCost = 0;
  let hypLiters = 0;
  let hypCo2 = 0;
  let evaluated = 0;

  for (const e of ctx.log) {
    if (e.fuelType === 'diesel') {
      // Already diesel — no change
      hypCost += e.totalCost;
      hypLiters += e.liters;
      hypCo2 += e.liters * CO2_FACTOR_KG_PER_LITER.diesel;
    } else {
      const newPrice = Math.max(0.5, e.pricePerLiter - dieselDiscount);
      const newLiters = e.liters * consumptionFactor;
      hypCost += newPrice * newLiters;
      hypLiters += newLiters;
      hypCo2 += newLiters * CO2_FACTOR_KG_PER_LITER.diesel;
    }
    evaluated++;
  }
  return {
    id: 'switch-to-diesel',
    actualCostEur: round2(ctx.totalCost),
    hypotheticalCostEur: round2(hypCost),
    deltaEur: round2(ctx.totalCost - hypCost),
    hypotheticalLiters: round2(hypLiters),
    actualCo2Kg: round2(ctx.totalCo2),
    hypotheticalCo2Kg: round2(hypCo2),
    deltaCo2Kg: round2(ctx.totalCo2 - hypCo2),
    evaluatedFills: evaluated,
  };
}

function switchToE10(ctx: Ctx): ScenarioResult {
  const params = SCENARIO_PARAMS.e10;
  let hypCost = 0;
  let hypLiters = 0;
  let hypCo2 = 0;
  let evaluated = 0;

  for (const e of ctx.log) {
    if (e.fuelType === 'diesel') {
      // No change — diesel users can't switch to E10
      hypCost += e.totalCost;
      hypLiters += e.liters;
      hypCo2 += e.liters * CO2_FACTOR_KG_PER_LITER.diesel;
    } else {
      const newPrice = e.pricePerLiter * params.pricePremiumFactor;
      const newLiters = e.liters * params.consumptionPenaltyFactor;
      hypCost += newPrice * newLiters;
      hypLiters += newLiters;
      hypCo2 += newLiters * CO2_FACTOR_KG_PER_LITER.e10;
    }
    evaluated++;
  }
  return {
    id: 'switch-to-e10',
    actualCostEur: round2(ctx.totalCost),
    hypotheticalCostEur: round2(hypCost),
    deltaEur: round2(ctx.totalCost - hypCost),
    hypotheticalLiters: round2(hypLiters),
    actualCo2Kg: round2(ctx.totalCo2),
    hypotheticalCo2Kg: round2(hypCo2),
    deltaCo2Kg: round2(ctx.totalCo2 - hypCo2),
    evaluatedFills: evaluated,
  };
}

function fillAtBestStation(ctx: Ctx): ScenarioResult {
  // For each fill, find the cheapest market price for the same
  // fuel within ±3 days of the fill date and use that price.
  const HALF_DAYS = 3;
  let hypCost = 0;
  let evaluated = 0;
  for (const e of ctx.log) {
    const ts = Date.parse(e.date);
    if (!Number.isFinite(ts)) {
      hypCost += e.totalCost;
      continue;
    }
    const lo = ts - HALF_DAYS * 24 * 3600 * 1000;
    const hi = ts + HALF_DAYS * 24 * 3600 * 1000;
    let cheapest = e.pricePerLiter;
    for (const s of ctx.market) {
      if (s.fuelType && s.fuelType !== e.fuelType) continue;
      const t = Date.parse(s.timestamp);
      if (!Number.isFinite(t) || t < lo || t > hi) continue;
      if (s.price > 0 && s.price < cheapest) cheapest = s.price;
    }
    hypCost += cheapest * e.liters;
    evaluated++;
  }
  return {
    id: 'fill-at-best-station',
    actualCostEur: round2(ctx.totalCost),
    hypotheticalCostEur: round2(hypCost),
    deltaEur: round2(ctx.totalCost - hypCost),
    hypotheticalLiters: round2(ctx.totalLiters),
    actualCo2Kg: round2(ctx.totalCo2),
    hypotheticalCo2Kg: round2(ctx.totalCo2),
    deltaCo2Kg: 0,
    evaluatedFills: evaluated,
  };
}

function fillBefore8am(ctx: Ctx): ScenarioResult {
  // Find the average market price for the 5-7am hour band per
  // fuel type, then assume every fill happened at that price.
  const earlyHourSums = new Map<FuelType, { sum: number; n: number }>();
  for (const s of ctx.market) {
    const t = Date.parse(s.timestamp);
    if (!Number.isFinite(t)) continue;
    const hr = new Date(t).getUTCHours();
    if (hr < 5 || hr > 7) continue;
    const ft = s.fuelType ?? 'e5';
    const cur = earlyHourSums.get(ft) ?? { sum: 0, n: 0 };
    cur.sum += s.price;
    cur.n += 1;
    earlyHourSums.set(ft, cur);
  }

  let hypCost = 0;
  let evaluated = 0;
  for (const e of ctx.log) {
    const stats = earlyHourSums.get(e.fuelType);
    if (!stats || stats.n === 0) {
      hypCost += e.totalCost;
      continue;
    }
    const avgEarly = stats.sum / stats.n;
    hypCost += avgEarly * e.liters;
    evaluated++;
  }
  return {
    id: 'fill-before-8am',
    actualCostEur: round2(ctx.totalCost),
    hypotheticalCostEur: round2(hypCost),
    deltaEur: round2(ctx.totalCost - hypCost),
    hypotheticalLiters: round2(ctx.totalLiters),
    actualCo2Kg: round2(ctx.totalCo2),
    hypotheticalCo2Kg: round2(ctx.totalCo2),
    deltaCo2Kg: 0,
    evaluatedFills: evaluated,
  };
}

const SCENARIOS = [
  switchToHybrid,
  switchToEv,
  switchToDiesel,
  switchToE10,
  fillAtBestStation,
  fillBefore8am,
] as const;

export interface CounterfactualInputs {
  log: readonly FuelLogEntry[];
  market: readonly PriceSnapshot[];
  /** Limit which scenarios to run; default = all six. */
  scenarios?: ScenarioId[];
}

export function computeCounterfactuals(inputs: CounterfactualInputs): CounterfactualResult | null {
  const ctx = buildCtx(inputs.log, inputs.market);
  if (!ctx) return null;

  const all = SCENARIOS.map((fn) => fn(ctx));
  const filter = inputs.scenarios;
  const scenarios = filter ? all.filter((s) => filter.includes(s.id)) : all;

  // Sort: best (highest deltaEur) first.
  scenarios.sort((a, b) => b.deltaEur - a.deltaEur);

  return {
    scenarios,
    spanLabel: {
      startIso: ctx.earliestIso,
      endIso: ctx.latestIso,
    },
  };
}
