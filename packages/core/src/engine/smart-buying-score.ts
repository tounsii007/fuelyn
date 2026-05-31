// ============================================================
// Fuelyn — Smart-Buying Score
//
// A single 0–100 KPI summarising how well the user has been
// timing/picking fuel purchases vs. what was available at the
// market on the same dates. Three weighted components:
//
//   1. PriceVsMarket   (60%) — how far below the day's market
//                              average each fill landed
//   2. Consistency     (25%) — does the user repeatedly catch
//                              good days, or just occasional luck?
//   3. SpreadCapture   (15%) — how close their average was to
//                              the cheapest day in the same window
//
// The score is intentionally NOT a leaderboard rank — it's a
// personal, repeatable metric. Two users in different regions
// with different fuel types can both score 88; they just both
// did equally well *given their constraints*.
// ============================================================

import type { FuelLogEntry, FuelType } from '../domain/types';
import type { PriceSnapshot } from './best-time-heatmap';

export interface SmartBuyingComponents {
  /** −1 (always paid more) … +1 (always paid less than market avg). */
  priceVsMarket: number;
  /** 0–1 share of fills that beat their day's market avg. */
  consistency: number;
  /** 0–1 — how close average fill was to "perfect timing" cheapest. */
  spreadCapture: number;
}

export interface SmartBuyingScore {
  /** 0–100 composite KPI, rounded to integer. */
  score: number;
  components: SmartBuyingComponents;
  /** Number of fuel-log entries that contributed. */
  evaluatedFills: number;
  /** Number of fills skipped because no market data covered that day. */
  skippedFills: number;
  /**
   * Net €/L the user under-spent vs. matched market average,
   * positive = saved, negative = overpaid. Multiplied by total
   * litres later for the "X € saved" claim.
   */
  avgEdgeEurPerL: number;
  /** Total estimated savings in € across all evaluated fills. */
  totalEdgeEur: number;
  /**
   * 0–1 confidence in the score:
   *   - drops when fewer than ~10 fills were evaluated
   *   - drops when most fills were skipped (sparse market data)
   */
  confidence: number;
  /**
   * Stable identifier the UI maps to a localised summary like
   * "Du tankst smart" / "Du kaufst zur falschen Zeit".
   */
  band: 'excellent' | 'great' | 'good' | 'average' | 'below-average' | 'poor';
}

const SCORE_WEIGHTS = {
  priceVsMarket: 0.6,
  consistency: 0.25,
  spreadCapture: 0.15,
} as const;

/**
 * 14-day half-window around each fill — wide enough to catch
 * the rough "market this week" reference but narrow enough that
 * a 6-month-old market average doesn't pollute a recent fill.
 */
const MARKET_HALF_WINDOW_DAYS = 14;

interface MarketStats {
  /** Mean of all snapshots for this fuel within the window. */
  mean: number;
  /** Cheapest snapshot in the window. */
  min: number;
  /** Sample count — used for skip decision. */
  count: number;
}

/**
 * Build a quick lookup of "market stats around day D for fuel F"
 * from the snapshot stream. Implemented as a sorted array + binary
 * search rather than a map: snapshots can be 90 days × hourly =
 * up to 2160 entries per fuel, and we evaluate each fill against
 * a sliding window. Direct array scan is plenty fast for the
 * normal size, and Map-by-day would still need re-aggregation
 * across the half-window.
 */
function statsAroundDay(
  sortedTs: number[],
  prices: number[],
  centerTs: number,
): MarketStats {
  const halfMs = MARKET_HALF_WINDOW_DAYS * 24 * 3600 * 1000;
  const lo = centerTs - halfMs;
  const hi = centerTs + halfMs;

  // Linear scan with early breaks (sortedTs is ascending).
  let sum = 0;
  let count = 0;
  let min = Infinity;
  for (let i = 0; i < sortedTs.length; i++) {
    const t = sortedTs[i]!;
    if (t < lo) continue;
    if (t > hi) break;
    const p = prices[i]!;
    sum += p;
    count += 1;
    if (p < min) min = p;
  }

  return count > 0
    ? { mean: sum / count, min, count }
    : { mean: 0, min: 0, count: 0 };
}

/**
 * Build a per-fuel `{ sortedTs, prices }` market index. Snapshots without a
 * fuelType match every fuel (the lite shape can't disambiguate). Shared by
 * computeSmartBuyingScore and classifyFillsVsMarket so both stay in lockstep
 * — and so callers evaluating many fills build it ONCE instead of re-sorting
 * the market per fill.
 */
function buildMarketIndex(
  fuels: Iterable<FuelType>,
  market: readonly PriceSnapshot[],
): Map<FuelType, { sortedTs: number[]; prices: number[] }> {
  const marketByFuel = new Map<FuelType, { sortedTs: number[]; prices: number[] }>();
  type TypedSnap = PriceSnapshot & { fuelType?: FuelType };
  const all = market as TypedSnap[];
  for (const ft of fuels) {
    const buf: { ts: number; price: number }[] = [];
    for (const s of all) {
      if (s.fuelType && s.fuelType !== ft) continue;
      const t = Date.parse(s.timestamp);
      if (!Number.isFinite(t)) continue;
      if (!Number.isFinite(s.price) || s.price <= 0) continue;
      buf.push({ ts: t, price: s.price });
    }
    buf.sort((a, b) => a.ts - b.ts);
    marketByFuel.set(ft, {
      sortedTs: buf.map((x) => x.ts),
      prices: buf.map((x) => x.price),
    });
  }
  return marketByFuel;
}

function bandFromScore(score: number): SmartBuyingScore['band'] {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'great';
  if (score >= 60) return 'good';
  if (score >= 45) return 'average';
  if (score >= 30) return 'below-average';
  return 'poor';
}

export interface SmartBuyingInputs {
  /** The user's fuel log. */
  log: readonly FuelLogEntry[];
  /** Market snapshots — typically pulled from priceHistory in the store. */
  market: readonly PriceSnapshot[];
  /** Optional fuel-type filter (when omitted, all fuels). */
  fuelType?: FuelType;
}

/**
 * Compute the smart-buying score from the user's fuel log and
 * market snapshot history. Pure function — no I/O, no globals
 * beyond Date.parse, deterministic for identical inputs.
 */
export function computeSmartBuyingScore(inputs: SmartBuyingInputs): SmartBuyingScore {
  const { log, market, fuelType } = inputs;

  // Pre-bucket market snapshots by fuel type — when the input
  // stream comes from priceHistory it's already typed; we keep
  // the bucket explicit for readability + per-fuel scoring later.
  const fillsByFuel = new Map<FuelType, FuelLogEntry[]>();
  for (const e of log) {
    if (fuelType && e.fuelType !== fuelType) continue;
    const arr = fillsByFuel.get(e.fuelType) ?? [];
    arr.push(e);
    fillsByFuel.set(e.fuelType, arr);
  }

  // Build the per-fuel market index ONCE (shared with classifyFillsVsMarket).
  const marketByFuel = buildMarketIndex(fillsByFuel.keys(), market);

  let evaluated = 0;
  let skipped = 0;
  let edgeSumEurPerL = 0; // Σ (market.mean − fill.price)
  let edgeWeightedSum = 0; // edge × liters → for total saved €
  let belowMarketCount = 0;
  let spreadCaptureSum = 0;

  for (const e of log) {
    if (fuelType && e.fuelType !== fuelType) continue;
    if (!Number.isFinite(e.pricePerLiter) || e.pricePerLiter <= 0) {
      skipped++;
      continue;
    }
    const ts = Date.parse(e.date);
    if (!Number.isFinite(ts)) {
      skipped++;
      continue;
    }

    const mkt = marketByFuel.get(e.fuelType);
    if (!mkt || mkt.sortedTs.length === 0) {
      skipped++;
      continue;
    }
    const stats = statsAroundDay(mkt.sortedTs, mkt.prices, ts);
    if (stats.count < 3) {
      // Not enough market context to draw a meaningful comparison.
      skipped++;
      continue;
    }

    const edge = stats.mean - e.pricePerLiter;
    edgeSumEurPerL += edge;
    edgeWeightedSum += edge * e.liters;
    if (edge > 0) belowMarketCount++;

    // Spread capture: 1.0 = bought at the absolute cheapest in
    // the window, 0.0 = bought at the absolute most expensive.
    // Fills at the mean score 0.5 — same as a coin flip.
    const max = stats.mean + (stats.mean - stats.min); // mirror around mean for symmetric range
    const spreadRange = max - stats.min;
    if (spreadRange > 0) {
      const t = 1 - (e.pricePerLiter - stats.min) / spreadRange;
      spreadCaptureSum += Math.max(0, Math.min(1, t));
    } else {
      spreadCaptureSum += 0.5;
    }

    evaluated++;
  }

  if (evaluated === 0) {
    return {
      score: 50,
      components: { priceVsMarket: 0, consistency: 0, spreadCapture: 0 },
      evaluatedFills: 0,
      skippedFills: skipped,
      avgEdgeEurPerL: 0,
      totalEdgeEur: 0,
      confidence: 0,
      band: 'average',
    };
  }

  const avgEdge = edgeSumEurPerL / evaluated;
  const totalEdgeEur = Math.round(edgeWeightedSum * 100) / 100;
  const consistency = belowMarketCount / evaluated;
  const spreadCapture = spreadCaptureSum / evaluated;

  // Normalize avgEdge into [-1, 1]:
  // ±0.10 €/L is roughly the practical extreme (≥10 ct off
  // market avg is exceptional). Clip beyond.
  const priceVsMarket = Math.max(-1, Math.min(1, avgEdge / 0.1));

  // Composite 0–100 score. We map each component from its
  // own range into [0,1] then weight + multiply by 100.
  const priceVsMarket01 = (priceVsMarket + 1) / 2;
  const composite01 =
    priceVsMarket01 * SCORE_WEIGHTS.priceVsMarket +
    consistency * SCORE_WEIGHTS.consistency +
    spreadCapture * SCORE_WEIGHTS.spreadCapture;
  const score = Math.round(composite01 * 100);

  // Confidence:
  //   - 1.0 with ≥10 fills evaluated and ≤20 % skipped
  //   - drops linearly with fewer fills or higher skip rate
  const sampleConfidence = Math.min(1, evaluated / 10);
  const skipRate = skipped / Math.max(1, skipped + evaluated);
  const skipConfidence = Math.max(0, 1 - skipRate * 1.5);
  const confidence = Math.round(sampleConfidence * skipConfidence * 100) / 100;

  return {
    score,
    components: {
      priceVsMarket,
      consistency,
      spreadCapture,
    },
    evaluatedFills: evaluated,
    skippedFills: skipped,
    avgEdgeEurPerL: Math.round(avgEdge * 1000) / 1000,
    totalEdgeEur,
    confidence,
    band: bandFromScore(score),
  };
}

// ─── Per-fill market classification (shared streak helper) ──────────────

export type FillMarketOutcome = 'below' | 'at-or-above' | 'no-context';

/**
 * Classify each fill against the windowed market mean for its fuel, sharing
 * ONE pre-built per-fuel market index instead of re-sorting the market per
 * fill. Returns an outcome per entry in `log` order, mirroring
 * computeSmartBuyingScore's single-fill result: 'below' ⟺ evaluated and
 * under the market mean; 'at-or-above' ⟺ evaluated and not under it;
 * 'no-context' ⟺ skipped (bad price/date, no market, or <3 samples).
 *
 * O(M log M + N·W): one sort of the market, then a windowed scan per fill —
 * versus O(N·M log M) when computeSmartBuyingScore is called once per fill.
 */
export function classifyFillsVsMarket(
  log: readonly FuelLogEntry[],
  market: readonly PriceSnapshot[],
  fuelType?: FuelType,
): FillMarketOutcome[] {
  const fuels = new Set<FuelType>();
  for (const e of log) {
    if (fuelType && e.fuelType !== fuelType) continue;
    fuels.add(e.fuelType);
  }
  const marketByFuel = buildMarketIndex(fuels, market);

  const out: FillMarketOutcome[] = [];
  for (const e of log) {
    if (fuelType && e.fuelType !== fuelType) {
      out.push('no-context');
      continue;
    }
    if (!Number.isFinite(e.pricePerLiter) || e.pricePerLiter <= 0) {
      out.push('no-context');
      continue;
    }
    const ts = Date.parse(e.date);
    if (!Number.isFinite(ts)) {
      out.push('no-context');
      continue;
    }
    const mkt = marketByFuel.get(e.fuelType);
    if (!mkt || mkt.sortedTs.length === 0) {
      out.push('no-context');
      continue;
    }
    const stats = statsAroundDay(mkt.sortedTs, mkt.prices, ts);
    if (stats.count < 3) {
      out.push('no-context');
      continue;
    }
    out.push(stats.mean - e.pricePerLiter > 0 ? 'below' : 'at-or-above');
  }
  return out;
}
