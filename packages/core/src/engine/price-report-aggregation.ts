// ============================================================
// Price-Report Aggregation
//
// Given a stack of recent reports for one (station, fuel) pair,
// decide:
//   1) Is there enough confidence-weighted agreement to override
//      the upstream feed price?
//   2) If so, what's the canonical value?
//   3) Otherwise, do we keep the upstream and just expose the
//      reports as a hint?
//
// Inputs are the rows already validated by validatePriceReport;
// outputs are deterministic so the BFF / future moderation
// dashboard can render them identically.
//
// Pure / deterministic.
// ============================================================

export interface AggregationInput {
  /** EUR / litre. */
  price: number;
  /** 0..1 confidence the validator assigned. */
  confidence: number;
  /** ISO timestamp the user observed it. */
  observedAt: string;
  /** True if a pump-display photo backed the report. */
  photoVerified: boolean;
}

export type AggregationDecision =
  | 'accept-canonical'  // strong consensus → override the upstream feed
  | 'flag-for-review'   // some signal but not enough — surface to moderators
  | 'keep-upstream';    // not enough evidence to act

export interface AggregationOptions {
  /** Window for "recent" reports, in hours. Default 6 h. */
  windowHours?: number;
  /** Minimum sum-of-weights needed to override. Default 1.5. */
  acceptanceThreshold?: number;
  /** Min sum-of-weights to flag for review. Default 0.6. */
  reviewThreshold?: number;
  /** Knownupstream price for delta-vs-canonical comparison. */
  upstreamPrice?: number | null;
  /** Optional clock injection for tests. */
  now?: Date;
}

export interface AggregationResult {
  decision: AggregationDecision;
  /** The aggregated canonical price (median of the weighted set). */
  canonicalPrice: number | null;
  /** Number of reports inside the analysis window. */
  windowCount: number;
  /** Sum of weights across the window. */
  totalWeight: number;
  /** Std-dev of the weighted prices — proxy for "do reports agree?". */
  stddevEurPerL: number;
  /** Reasoning string for the moderation log. */
  reason: string;
}

const DEFAULT_WINDOW_HOURS = 6;
const DEFAULT_ACCEPT = 1.5;
const DEFAULT_REVIEW = 0.6;
/** Standard-deviation threshold above which we refuse to accept (=disagreement). */
const STDDEV_DISAGREEMENT_CUTOFF = 0.04;

export function aggregateReports(
  reports: ReadonlyArray<AggregationInput>,
  opts: AggregationOptions = {},
): AggregationResult {
  const windowHours = opts.windowHours ?? DEFAULT_WINDOW_HOURS;
  const acceptThr = opts.acceptanceThreshold ?? DEFAULT_ACCEPT;
  const reviewThr = opts.reviewThreshold ?? DEFAULT_REVIEW;
  const now = opts.now ?? new Date();
  const cutoff = now.getTime() - windowHours * 3600 * 1000;

  // Filter to window + valid prices.
  const inWindow = reports.filter((r) => {
    const t = new Date(r.observedAt).getTime();
    return Number.isFinite(t) && t >= cutoff && r.price > 0 && r.confidence > 0;
  });

  if (inWindow.length === 0) {
    return {
      decision: 'keep-upstream',
      canonicalPrice: null,
      windowCount: 0,
      totalWeight: 0,
      stddevEurPerL: 0,
      reason: 'no reports in window',
    };
  }

  // Photo-verified rows get a +50% weight bump beyond their base
  // confidence — visual proof is the strongest signal we have.
  const weighted = inWindow.map((r) => ({
    price: r.price,
    weight: r.confidence * (r.photoVerified ? 1.5 : 1),
  }));

  const totalWeight = weighted.reduce((s, x) => s + x.weight, 0);
  const canonicalPrice = weightedMedian(weighted);
  const stddevEurPerL = weightedStdDev(weighted, canonicalPrice);

  // Decision tree:
  //   * Disagreement (stddev > 4 ct/L) → flag for review even if weight is high
  //   * Total weight ≥ acceptanceThreshold → accept
  //   * Total weight ≥ reviewThreshold     → flag for review
  //   * Otherwise → keep upstream
  let decision: AggregationDecision;
  let reason: string;
  if (stddevEurPerL > STDDEV_DISAGREEMENT_CUTOFF) {
    decision = 'flag-for-review';
    reason = `disagreement (σ=${stddevEurPerL.toFixed(3)} €/L)`;
  } else if (totalWeight >= acceptThr) {
    decision = 'accept-canonical';
    reason = `weight ${totalWeight.toFixed(2)} ≥ ${acceptThr}, σ=${stddevEurPerL.toFixed(3)}`;
  } else if (totalWeight >= reviewThr) {
    decision = 'flag-for-review';
    reason = `weight ${totalWeight.toFixed(2)} ∈ [${reviewThr}, ${acceptThr})`;
  } else {
    decision = 'keep-upstream';
    reason = `weight ${totalWeight.toFixed(2)} < ${reviewThr}`;
  }

  return {
    decision,
    canonicalPrice: round(canonicalPrice, 3),
    windowCount: inWindow.length,
    totalWeight: round(totalWeight, 3),
    stddevEurPerL: round(stddevEurPerL, 4),
    reason,
  };
}

// -----------------------------------------------------------------
// Helpers — weighted median, weighted std dev
// -----------------------------------------------------------------

function weightedMedian(items: ReadonlyArray<{ price: number; weight: number }>): number {
  // Sort ascending by price, walk the cumulative weight until we
  // cross half of the total.
  const sorted = [...items].sort((a, b) => a.price - b.price);
  const total = sorted.reduce((s, x) => s + x.weight, 0);
  let cum = 0;
  for (const item of sorted) {
    cum += item.weight;
    if (cum >= total / 2) return item.price;
  }
  return sorted[sorted.length - 1]?.price ?? 0;
}

function weightedStdDev(
  items: ReadonlyArray<{ price: number; weight: number }>,
  mean: number,
): number {
  const totalWeight = items.reduce((s, x) => s + x.weight, 0);
  if (totalWeight === 0) return 0;
  const variance = items.reduce((s, x) => {
    const d = x.price - mean;
    return s + x.weight * d * d;
  }, 0) / totalWeight;
  return Math.sqrt(variance);
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
