// ============================================================
// Price Intelligence Engine — single source of truth.
//
// The heuristic recommendation logic used by:
//   • web BFF fallback when the AI backend is unreachable
//   • offline-mode mobile and web clients
//   • documentation / preview routes via getMockRecommendation
//
// Previously duplicated in apps/web; consolidated here to prevent
// drift between TypeScript and Java implementations.
// ============================================================

import type { FuelType } from '../domain/types';

// ─── Public Types ───────────────────────────────────────────

export type Confidence = 'high' | 'medium' | 'low';
export type Action = 'buy_now' | 'wait';

export interface PriceRecommendation {
  readonly action: Action;
  readonly headline: string;
  readonly explanation: string;
  readonly bestTimePrediction: string;
  readonly savingsEstimate: number;
  readonly fillUpLiters: number;
  readonly confidence: Confidence;
  readonly trend: number;
  /**
   * Day of the week with the cheapest historical average. `null`
   * when the data is too thin to identify a meaningful pattern —
   * e.g. only one weekday has samples, or the price is essentially
   * flat across the week. Surfacing a non-null value when the data
   * is noise leads to contradictions like "Preise fallen typischer-
   * weise Samstags. Vermeide Samstags." (a real bug that prompted
   * this nullable signature).
   */
  readonly cheapestDay: string | null;
  /** Counterpart to {@link cheapestDay}; same null semantics. */
  readonly expensiveDay: string | null;
}

export interface PriceDataInput {
  readonly price: number;
  readonly timestamp: string;
}

// ─── Tunables (documented, not magic) ───────────────────────

interface PriceIntelligenceDefaults {
  fillUpLiters: number;
  minDataPoints: number;
  trendThreshold: number;
  belowAverageThreshold: number;
  highConfidenceMinPoints: number;
  highConfidenceTrend: number;
  mediumConfidenceMinPoints: number;
}

/**
 * Analysis tunables. Exported so tests, alternative engines, and A/B
 * comparisons can override without touching call sites.
 */
export const PRICE_INTELLIGENCE_DEFAULTS: Readonly<PriceIntelligenceDefaults> = {
  fillUpLiters: 50,
  minDataPoints: 4,
  trendThreshold: 0.003,
  belowAverageThreshold: 0.005,
  highConfidenceMinPoints: 14,
  highConfidenceTrend: 0.01,
  mediumConfidenceMinPoints: 7,
};

const DAY_NAMES_DE = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
] as const;

// ─── Analysis Engine ────────────────────────────────────────

export function analyzePrices(
  data: readonly PriceDataInput[],
  _fuelType?: FuelType,
  fillUpLiters = PRICE_INTELLIGENCE_DEFAULTS.fillUpLiters,
): PriceRecommendation {
  const sorted = [...data]
    .filter((d) => Number.isFinite(d.price) && d.price > 0)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  if (sorted.length < PRICE_INTELLIGENCE_DEFAULTS.minDataPoints) {
    return fallbackRecommendation(fillUpLiters);
  }

  const { trend } = computeTrend(sorted);
  const { cheapestDay, expensiveDay } = dayOfWeekExtremes(sorted);
  const overallAvg = mean(sorted.map((d) => d.price));
  const currentPrice = sorted[sorted.length - 1]!.price;
  const priceVsAvg = currentPrice - overallAvg;
  const belowAvg = priceVsAvg < -PRICE_INTELLIGENCE_DEFAULTS.belowAverageThreshold;
  const falling = trend < -PRICE_INTELLIGENCE_DEFAULTS.trendThreshold;
  const rising = trend > PRICE_INTELLIGENCE_DEFAULTS.trendThreshold;

  let action: Action;
  let headline: string;
  let explanation: string;

  if (belowAvg && !rising) {
    action = 'buy_now';
    headline = 'Jetzt tanken!';
    explanation = `Der aktuelle Preis liegt unter dem Durchschnitt der letzten Tage.${
      falling ? ' Die Preise fallen zudem weiter.' : ''
    }`;
  } else if (falling) {
    action = 'wait';
    headline = 'Warten lohnt sich';
    explanation =
      'Die Preise zeigen einen fallenden Trend. Ein späterer Tankstopp könnte günstiger sein.';
  } else if (rising && !belowAvg) {
    action = 'buy_now';
    headline = 'Jetzt tanken!';
    explanation = 'Die Preise steigen. Es lohnt sich, jetzt zu tanken, bevor es teurer wird.';
  } else {
    action = 'wait';
    headline = 'Warten lohnt sich';
    // Only suggest the cheap day when we actually have one —
    // otherwise we'd be inviting the user back on a guess.
    explanation = cheapestDay
      ? `Der Preis liegt über dem Durchschnitt. Versuche es an einem ${cheapestDay} erneut.`
      : 'Der Preis liegt über dem Durchschnitt. Es lohnt sich, später erneut zu prüfen.';
  }

  const savingsEstimate = computeSavingsEstimate(sorted, fillUpLiters);
  const confidence = classifyConfidence(sorted.length, trend);
  // Only emit the day-pair tip when both are present AND distinct.
  // Otherwise fall back to the generic Tankerkönig pattern so we
  // never produce contradictions like "fallen Samstags. Vermeide
  // Samstags." (the bug that motivated nullable cheapest/expensive).
  const bestTimePrediction =
    cheapestDay && expensiveDay && cheapestDay !== expensiveDay
      ? `Preise fallen typischerweise ${cheapestDay}s. Vermeide ${expensiveDay}s.`
      : 'Preise fallen typischerweise dienstags und mittwochs.';

  return {
    action,
    headline,
    explanation,
    bestTimePrediction,
    savingsEstimate,
    fillUpLiters,
    confidence,
    trend,
    cheapestDay,
    expensiveDay,
  };
}

export function fallbackRecommendation(
  fillUpLiters = PRICE_INTELLIGENCE_DEFAULTS.fillUpLiters,
): PriceRecommendation {
  return {
    action: 'wait',
    headline: 'Noch nicht genug Daten',
    explanation:
      'Es werden mindestens 4 Preisdatenpunkte benötigt, um eine Empfehlung abzugeben.',
    bestTimePrediction: 'Preise fallen typischerweise dienstags und mittwochs.',
    savingsEstimate: 0,
    fillUpLiters,
    confidence: 'low',
    trend: 0,
    cheapestDay: 'Dienstag',
    expensiveDay: 'Freitag',
  };
}

export function getMockRecommendation(
  fuelType: FuelType = 'e10',
  fillUpLiters = PRICE_INTELLIGENCE_DEFAULTS.fillUpLiters,
): PriceRecommendation {
  const now = new Date();
  const mockData: PriceDataInput[] = [];

  const base = fuelType === 'diesel' ? 1.589 : fuelType === 'e5' ? 1.789 : 1.729;
  let price = base;

  for (let d = 20; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    const dow = date.getDay();
    const dowEffect = dow === 2 || dow === 3 ? -0.018 : dow === 5 || dow === 6 ? 0.013 : 0;
    price = price + (Math.random() - 0.5) * 0.025 + (base - price) * 0.08 + dowEffect;
    price = Math.max(base - 0.1, Math.min(base + 0.1, price));
    mockData.push({
      price: Math.round(price * 1000) / 1000,
      timestamp: date.toISOString(),
    });
  }

  return analyzePrices(mockData, fuelType, fillUpLiters);
}

// ─── Helpers ────────────────────────────────────────────────

function computeTrend(sorted: readonly PriceDataInput[]): { trend: number } {
  const recent = sorted.slice(-3);
  const earlier = sorted.slice(-6, -3);
  const recentAvg = mean(recent.map((d) => d.price));
  const earlierAvg = earlier.length > 0 ? mean(earlier.map((d) => d.price)) : recentAvg;
  return { trend: recentAvg - earlierAvg };
}

/**
 * Minimum prices per weekday before we trust the bucket's average.
 * One sample can be an outlier (a sale, a misreport); two starts to
 * smooth that out enough for a directional comparison.
 */
const MIN_SAMPLES_PER_DAY = 2;
/**
 * How many distinct weekdays must have at least {@link MIN_SAMPLES_PER_DAY}
 * samples before we attempt to compare them at all. Below this we
 * couldn't tell "Saturday is cheapest" from "Saturday is the only
 * day we have data for".
 */
const MIN_POPULATED_DAYS = 3;
/**
 * Cheapest-vs-most-expensive average has to differ by at least this
 * much (in EUR) before we surface the pattern. Below 0.5 ct the
 * "best day" is just noise.
 */
const MIN_DAY_VARIANCE = 0.005;

/**
 * Identify the cheapest and most expensive weekdays from the price
 * history. Returns {@code null} for either field when the data is
 * too sparse / noisy to make a meaningful claim — the call site
 * then falls back to a generic tip instead of producing a
 * self-contradicting message.
 *
 * Visible for tests via the export.
 */
export function dayOfWeekExtremes(
  sorted: readonly PriceDataInput[],
): { cheapestDay: string | null; expensiveDay: string | null } {
  const dowBuckets: number[][] = Array.from({ length: 7 }, () => []);
  for (const d of sorted) {
    const day = new Date(d.timestamp).getDay();
    dowBuckets[day]!.push(d.price);
  }
  // Only count a weekday's average if it has enough samples to
  // dampen a single outlier. With <2 samples per day we can't
  // distinguish a real pattern from one fluke reading.
  const dowAvg = dowBuckets.map((b) =>
    b.length >= MIN_SAMPLES_PER_DAY ? mean(b) : null,
  );
  const populatedDays = dowAvg.filter((v) => v !== null).length;
  if (populatedDays < MIN_POPULATED_DAYS) {
    return { cheapestDay: null, expensiveDay: null };
  }

  // -1 sentinels: the previous version initialised to 0, which
  // meant "no data → blame Sonntag" — a silent way for the bug to
  // surface. Sentinels make the "no result" case explicit.
  let cheapestIdx = -1;
  let expensiveIdx = -1;
  let cheapestVal = Number.POSITIVE_INFINITY;
  let expensiveVal = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < dowAvg.length; i++) {
    const avg = dowAvg[i];
    if (avg == null) continue;
    if (avg < cheapestVal) {
      cheapestVal = avg;
      cheapestIdx = i;
    }
    if (avg > expensiveVal) {
      expensiveVal = avg;
      expensiveIdx = i;
    }
  }

  // Same day on both ends, or near-zero variance → no real pattern.
  // We'd rather stay silent than emit "fallen Samstags. Vermeide
  // Samstags." which the user (rightfully) read as broken.
  if (
    cheapestIdx < 0 ||
    expensiveIdx < 0 ||
    cheapestIdx === expensiveIdx ||
    expensiveVal - cheapestVal < MIN_DAY_VARIANCE
  ) {
    return { cheapestDay: null, expensiveDay: null };
  }

  return {
    cheapestDay: DAY_NAMES_DE[cheapestIdx]!,
    expensiveDay: DAY_NAMES_DE[expensiveIdx]!,
  };
}

function computeSavingsEstimate(
  sorted: readonly PriceDataInput[],
  fillUpLiters: number,
): number {
  const prices = sorted.map((d) => d.price);
  const spread = Math.max(...prices) - Math.min(...prices);
  return Math.round(spread * fillUpLiters * 100) / 100;
}

function classifyConfidence(points: number, trend: number): Confidence {
  const cfg = PRICE_INTELLIGENCE_DEFAULTS;
  if (points >= cfg.highConfidenceMinPoints && Math.abs(trend) > cfg.highConfidenceTrend) {
    return 'high';
  }
  if (points >= cfg.mediumConfidenceMinPoints) return 'medium';
  return 'low';
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}
