// ============================================================
// Fuelyn — Lightweight price prediction
//
// Predicts the next 24h of fuel prices from a station's recent
// snapshot history. NOT a deep-learning model — three composable
// signals weighted by data confidence:
//
//   1. Hourly seasonal pattern    (price-by-hour-of-day average)
//   2. Daily seasonal pattern     (price-by-day-of-week average)
//   3. Recent EWMA trend          (where prices are moving)
//
// We deliberately stay pure-TS so we can:
//   - Run server-side in the BFF without a Python sidecar
//   - Run client-side as a "what-if" toy without a network call
//   - Test the prediction path with synthetic series in vitest
//
// The output mirrors what a user-facing UI needs:
//   - bestHour / bestPrice — when to fuel up next
//   - worstHour / worstPrice — when to avoid
//   - hourly trace — for a sparkline / heatmap
//   - confidence — how trustworthy the prediction is, derived
//     from the variance of the historical signal
// ============================================================

export interface PriceSnapshot {
  /** ISO 8601 timestamp string. */
  readonly timestamp: string;
  /** Price in € per liter. */
  readonly price: number;
}

export interface PredictedHour {
  /** Absolute clock hour (0–23) in local time. */
  readonly hour: number;
  /** Predicted price in € per liter. */
  readonly price: number;
  /** Hours from "now" the prediction refers to (0–23). */
  readonly offsetHours: number;
}

export interface PricePrediction {
  /** 24-step trace, hour 0 = next hour after `now`. */
  readonly hourly: readonly PredictedHour[];
  /** Hour with the lowest predicted price in the next 24h. */
  readonly bestHour: PredictedHour;
  /** Hour with the highest predicted price in the next 24h. */
  readonly worstHour: PredictedHour;
  /** Difference (€/L) between best and worst hour in the trace. */
  readonly spreadEurPerL: number;
  /**
   * 0–1 confidence in the prediction. Drops when:
   *   - History is short (< 7 days)
   *   - History is sparse (gaps > 6h between samples)
   *   - Variance within hour-of-day buckets is high
   */
  readonly confidence: number;
  /**
   * Free-form rationale for UI display. Localisation happens
   * client-side; this is a stable identifier the UI maps to a
   * translated string.
   */
  readonly rationale:
    | 'down-trending'
    | 'up-trending'
    | 'stable-with-pattern'
    | 'insufficient-data';
}

interface NormalizedSnapshot {
  ts: number;       // unix ms
  price: number;
  hour: number;     // 0–23
  dayOfWeek: number; // 0=Sun … 6=Sat (matches Date.getDay)
}

const MIN_SAMPLES_FOR_PATTERN = 8;
const MIN_DAYS_FOR_HIGH_CONFIDENCE = 7;
const EWMA_ALPHA = 0.18; // ~5-sample half-life — sensitive but not flighty

/**
 * Drop bad inputs (NaN/Infinity, non-positive prices, malformed
 * timestamps) before they poison the averages. Snapshots are
 * sorted ascending by timestamp so the EWMA accumulator runs
 * in chronological order regardless of how the caller passed
 * them in.
 */
function normalize(history: readonly PriceSnapshot[]): NormalizedSnapshot[] {
  const out: NormalizedSnapshot[] = [];
  for (const s of history) {
    if (!Number.isFinite(s.price) || s.price <= 0 || s.price > 10) continue;
    const t = Date.parse(s.timestamp);
    if (!Number.isFinite(t)) continue;
    const d = new Date(t);
    out.push({
      ts: t,
      price: s.price,
      hour: d.getHours(),
      dayOfWeek: d.getDay(),
    });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

/**
 * Bucket prices by hour-of-day and return the mean per bucket.
 * Empty buckets fall back to the global mean so missing hours
 * don't push the prediction towards zero.
 */
function hourlyMeans(samples: NormalizedSnapshot[]): number[] {
  const sums = new Array<number>(24).fill(0);
  const counts = new Array<number>(24).fill(0);
  for (const s of samples) {
    sums[s.hour]! += s.price;
    counts[s.hour]! += 1;
  }
  const globalMean =
    samples.reduce((acc, s) => acc + s.price, 0) / Math.max(samples.length, 1);
  return sums.map((sum, i) => (counts[i]! > 0 ? sum / counts[i]! : globalMean));
}

/** Same shape as `hourlyMeans` but bucketed by day-of-week. */
function dailyMeans(samples: NormalizedSnapshot[]): number[] {
  const sums = new Array<number>(7).fill(0);
  const counts = new Array<number>(7).fill(0);
  for (const s of samples) {
    sums[s.dayOfWeek]! += s.price;
    counts[s.dayOfWeek]! += 1;
  }
  const globalMean =
    samples.reduce((acc, s) => acc + s.price, 0) / Math.max(samples.length, 1);
  return sums.map((sum, i) => (counts[i]! > 0 ? sum / counts[i]! : globalMean));
}

/**
 * Exponentially weighted moving average — recent samples have
 * more weight than old ones. Returns the final value (last EWMA
 * estimate) which represents "where prices are right now"
 * after smoothing out point-noise.
 */
function ewma(samples: NormalizedSnapshot[]): number {
  if (samples.length === 0) return 0;
  let acc = samples[0]!.price;
  for (let i = 1; i < samples.length; i++) {
    acc = EWMA_ALPHA * samples[i]!.price + (1 - EWMA_ALPHA) * acc;
  }
  return acc;
}

/**
 * Estimate trend slope (€/L per day) from the LAST 5 days of
 * data via simple linear regression. Used to lean predictions
 * up or down in addition to the seasonal pattern.
 */
function recentTrendSlope(samples: NormalizedSnapshot[]): number {
  const fiveDaysAgo = Date.now() - 5 * 24 * 3600 * 1000;
  const recent = samples.filter((s) => s.ts >= fiveDaysAgo);
  if (recent.length < 4) return 0;
  // Days-since-first-sample as the x-axis so values stay small
  // and well-conditioned for the closed-form regression below.
  const t0 = recent[0]!.ts;
  const xs = recent.map((s) => (s.ts - t0) / (24 * 3600 * 1000));
  const ys = recent.map((s) => s.price);
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let numer = 0;
  let denom = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - meanX;
    numer += dx * (ys[i]! - meanY);
    denom += dx * dx;
  }
  return denom > 0 ? numer / denom : 0;
}

/**
 * Per-hour-bucket variance — rough proxy for how repeatable
 * the hourly pattern is. Low intra-bucket variance = high
 * confidence; high variance = low confidence.
 */
function avgHourlyVariance(samples: NormalizedSnapshot[]): number {
  const buckets: number[][] = Array.from({ length: 24 }, () => []);
  for (const s of samples) buckets[s.hour]!.push(s.price);
  const variances: number[] = [];
  for (const b of buckets) {
    if (b.length < 2) continue;
    const m = b.reduce((a, x) => a + x, 0) / b.length;
    const v = b.reduce((a, x) => a + (x - m) ** 2, 0) / b.length;
    variances.push(v);
  }
  if (variances.length === 0) return 0;
  return variances.reduce((a, b) => a + b, 0) / variances.length;
}

function spanDays(samples: NormalizedSnapshot[]): number {
  if (samples.length < 2) return 0;
  const ms = samples[samples.length - 1]!.ts - samples[0]!.ts;
  return ms / (24 * 3600 * 1000);
}

/**
 * Insufficient-data prediction — a flat trace at the current
 * (or zero) price, near-zero confidence. Lets the UI render a
 * placeholder without separate "no prediction" code paths.
 */
function emptyPrediction(now: Date, basePrice: number): PricePrediction {
  const hourly: PredictedHour[] = [];
  const baseHour = now.getHours();
  for (let h = 0; h < 24; h++) {
    const hour = (baseHour + h + 1) % 24;
    hourly.push({ hour, price: basePrice, offsetHours: h });
  }
  return {
    hourly,
    bestHour: hourly[0]!,
    worstHour: hourly[0]!,
    spreadEurPerL: 0,
    confidence: 0,
    rationale: 'insufficient-data',
  };
}

export interface PredictPricesOptions {
  /** Override "now" — defaults to current time. Useful in tests. */
  readonly now?: Date;
}

/**
 * Predict the next 24 hours of prices for one station from its
 * snapshot history. See file header for the algorithm overview.
 *
 * Returns a deterministic `PricePrediction`; never throws.
 */
export function predictNext24h(
  history: readonly PriceSnapshot[],
  options: PredictPricesOptions = {},
): PricePrediction {
  const now = options.now ?? new Date();
  const samples = normalize(history);

  if (samples.length < MIN_SAMPLES_FOR_PATTERN) {
    const fallback = samples.length > 0 ? samples[samples.length - 1]!.price : 0;
    return emptyPrediction(now, fallback);
  }

  const hourly = hourlyMeans(samples);
  const daily = dailyMeans(samples);
  const ewmaNow = ewma(samples);
  const slopePerDay = recentTrendSlope(samples);

  // Anchor the prediction series on the EWMA (current "true"
  // price) so the absolute level stays close to reality. Then
  // overlay seasonal multipliers + the recent trend.
  const globalHourlyMean =
    hourly.reduce((a, b) => a + b, 0) / Math.max(hourly.length, 1);
  const globalDailyMean =
    daily.reduce((a, b) => a + b, 0) / Math.max(daily.length, 1);

  const trace: PredictedHour[] = [];
  const baseHour = now.getHours();
  const baseDow = now.getDay();
  for (let offset = 0; offset < 24; offset++) {
    const hour = (baseHour + offset + 1) % 24;
    // Day-of-week advances every time the absolute hour wraps
    // past midnight. We compute it from the cumulative offset
    // instead of tracking state for clarity.
    const dow = (baseDow + Math.floor((baseHour + offset + 1) / 24)) % 7;

    const hourMultiplier = globalHourlyMean > 0 ? hourly[hour]! / globalHourlyMean : 1;
    const dayMultiplier = globalDailyMean > 0 ? daily[dow]! / globalDailyMean : 1;
    // Trend contribution scaled by hours forward. slopePerDay
    // is already in €/L per day, so divide by 24 to get per-hour.
    const trendShift = (slopePerDay / 24) * (offset + 1);

    const predicted =
      ewmaNow * hourMultiplier * dayMultiplier + trendShift;

    trace.push({
      hour,
      price: Math.max(0, Math.round(predicted * 1000) / 1000),
      offsetHours: offset,
    });
  }

  // Best / worst across the 24-step trace.
  let best = trace[0]!;
  let worst = trace[0]!;
  for (const p of trace) {
    if (p.price < best.price) best = p;
    if (p.price > worst.price) worst = p;
  }
  const spread = Math.round((worst.price - best.price) * 1000) / 1000;

  // Confidence: 1.0 = ≥7 days of data + low variance + clear
  // trend; 0.0 = barely any data or the variance dwarfs the
  // pattern. Bounds are clamped to [0, 1].
  const days = spanDays(samples);
  const dataConfidence = Math.min(1, days / MIN_DAYS_FOR_HIGH_CONFIDENCE);
  const meanPrice = ewmaNow;
  const variance = avgHourlyVariance(samples);
  // Variance penalty — if the std-dev is comparable to the
  // mean (~5%), the hourly pattern is noise; below 0.5% it's
  // strongly repeatable.
  const cv = meanPrice > 0 ? Math.sqrt(variance) / meanPrice : 1;
  const varianceConfidence = Math.max(0, Math.min(1, 1 - cv * 25));
  const confidence = Math.round(dataConfidence * varianceConfidence * 100) / 100;

  let rationale: PricePrediction['rationale'] = 'stable-with-pattern';
  if (slopePerDay < -0.005) rationale = 'down-trending';
  else if (slopePerDay > 0.005) rationale = 'up-trending';

  return {
    hourly: trace,
    bestHour: best,
    worstHour: worst,
    spreadEurPerL: spread,
    confidence,
    rationale,
  };
}
