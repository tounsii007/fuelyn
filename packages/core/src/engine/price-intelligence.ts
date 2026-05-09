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
  readonly cheapestDay: string;
  readonly expensiveDay: string;
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
    // Avoid telling the user to come back on a day that is today.
    const todayName =
      DAY_NAMES_DE[
        new Date(sorted[sorted.length - 1]!.timestamp).getDay()
      ]!;
    explanation =
      cheapestDay === todayName || cheapestDay === expensiveDay
        ? 'Der Preis liegt über dem Durchschnitt. Es lohnt sich, ein paar Stunden zu warten.'
        : `Der Preis liegt über dem Durchschnitt. Versuche es an einem ${cheapestDay} erneut.`;
  }

  const savingsEstimate = computeSavingsEstimate(sorted, fillUpLiters);
  const confidence = classifyConfidence(sorted.length, trend);
  const todayDay =
    DAY_NAMES_DE[
      new Date(sorted[sorted.length - 1]!.timestamp).getDay()
    ]!;
  const bestTimePrediction = buildBestTimePrediction(
    cheapestDay,
    expensiveDay,
    todayDay,
  );

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
 * Build a non-contradictory wochentags hint, taking today into account.
 *
 * The previous template ("Preise fallen typischerweise ${a}s. Vermeide ${b}s.")
 * could collapse into a self-contradiction when `cheapestDay === expensiveDay`
 * (e.g., only one calendar day of data) and offered no situational context
 * for today's day-of-week. The new logic explicitly handles four cases:
 *   1. cheapest === expensive → not enough variance, hedge wording
 *   2. today is the cheapest day → encourage tanking now
 *   3. today is the most expensive day → suggest waiting until cheapest
 *   4. otherwise → name both extremes neutrally
 */
function buildBestTimePrediction(
  cheapestDay: string,
  expensiveDay: string,
  todayDay: string,
): string {
  if (cheapestDay === expensiveDay) {
    return 'Noch nicht genug Datenpunkte über die Woche für eine Tages-Empfehlung.';
  }
  if (todayDay === cheapestDay) {
    return `Heute (${todayDay}) ist typischerweise einer der günstigsten Tage — gute Gelegenheit.`;
  }
  if (todayDay === expensiveDay) {
    return `Heute (${todayDay}) ist meist teuer. Günstiger wird's typischerweise ${cheapestDay}s.`;
  }
  return `Preise sind ${cheapestDay}s am günstigsten und ${expensiveDay}s am teuersten.`;
}

function dayOfWeekExtremes(
  sorted: readonly PriceDataInput[],
): { cheapestDay: string; expensiveDay: string } {
  const dowBuckets: number[][] = Array.from({ length: 7 }, () => []);
  for (const d of sorted) {
    const day = new Date(d.timestamp).getDay();
    dowBuckets[day]!.push(d.price);
  }
  const dowAvg = dowBuckets.map((b) => (b.length > 0 ? mean(b) : null));

  let cheapestIdx = 0;
  let expensiveIdx = 0;
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
