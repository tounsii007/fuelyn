// ============================================================
// Anonymous Price Report — validation engine
//
// Crowd-sourced "this price is wrong" reports help keep the
// upstream feed honest, but they are also a vector for spam,
// griefing and adversarial poisoning. This engine validates a
// single submission deterministically before it ever reaches
// storage:
//
//   * sanity-bound the price to plausible €/L range,
//   * normalize the timestamp,
//   * reject obvious prank values (NaN, infinities, > 4 €/L),
//   * compare to the most recent known price (if supplied) and
//     classify the magnitude of the disagreement,
//   * compute a confidence score the backend can use for
//     weighting (single-report → low; matches official → high).
//
// Pure: no I/O. The web BFF / future Java service decides what
// to do with the validated record (rate-limit, persist, vote).
// ============================================================

import type { FuelType } from '../domain/types';

// -----------------------------------------------------------------
// Types
// -----------------------------------------------------------------

export interface PriceReportInput {
  /** Tankerkönig-style station ID (UUID-ish, but we don't enforce shape here). */
  stationId: string;
  /** Reported fuel type. */
  fuelType: FuelType;
  /** User-reported €/L. */
  price: number;
  /** ISO timestamp of when the user observed the price. Optional — defaults to now. */
  observedAt?: string;
  /**
   * Most recent KNOWN price for this fuel at this station, if available.
   * The engine uses it to flag spam (e.g. user reports 0.50 when the
   * official feed says 1.74).
   */
  knownPrice?: number | null;
}

export type ReportClassification =
  | 'matches-known' // within 0.5 ct of the known feed price → not really a "report"
  | 'minor-correction' // 0.5–3 ct off → likely real price-list update
  | 'major-correction' // 3–10 ct off → significant correction
  | 'suspicious' // > 10 ct off OR price < 0.80 — needs vote to confirm
  | 'no-known-price'; // no comparison possible — neutral

export interface PriceReportValidation {
  ok: boolean;
  /** Normalized record ready to persist. Only present when ok = true. */
  record?: {
    stationId: string;
    fuelType: FuelType;
    price: number;
    observedAt: string;
  };
  /** Why a report was rejected, when ok = false. */
  rejection?:
    | 'price-not-finite'
    | 'price-out-of-range'
    | 'station-id-empty'
    | 'fuel-type-invalid'
    | 'observed-at-invalid';
  /** Diagnostic classification, regardless of accept/reject. */
  classification: ReportClassification;
  /** 0..1 — heuristic confidence for the backend's voting algorithm. */
  confidence: number;
  /** Absolute delta in EUR/L vs knownPrice (0 if no comparison). */
  deltaEurPerL: number;
}

// -----------------------------------------------------------------
// Constants
// -----------------------------------------------------------------

/** Lower bound — anything cheaper is almost certainly a typo or prank. */
export const MIN_PLAUSIBLE_PRICE = 0.5;
/** Upper bound — even "shock-headline" prices stay below this in EU. */
export const MAX_PLAUSIBLE_PRICE = 3.99;

const VALID_FUELS: ReadonlySet<FuelType> = new Set(['diesel', 'e5', 'e10']);

// -----------------------------------------------------------------
// Engine
// -----------------------------------------------------------------

export function validatePriceReport(input: PriceReportInput): PriceReportValidation {
  const stationId = (input.stationId ?? '').trim();
  if (!stationId) {
    return {
      ok: false,
      rejection: 'station-id-empty',
      classification: 'suspicious',
      confidence: 0,
      deltaEurPerL: 0,
    };
  }

  if (!VALID_FUELS.has(input.fuelType)) {
    return {
      ok: false,
      rejection: 'fuel-type-invalid',
      classification: 'suspicious',
      confidence: 0,
      deltaEurPerL: 0,
    };
  }

  if (!Number.isFinite(input.price)) {
    return {
      ok: false,
      rejection: 'price-not-finite',
      classification: 'suspicious',
      confidence: 0,
      deltaEurPerL: 0,
    };
  }

  if (input.price < MIN_PLAUSIBLE_PRICE || input.price > MAX_PLAUSIBLE_PRICE) {
    return {
      ok: false,
      rejection: 'price-out-of-range',
      classification: 'suspicious',
      confidence: 0,
      deltaEurPerL: 0,
    };
  }

  const observedAt = input.observedAt ?? new Date().toISOString();
  const observed = new Date(observedAt);
  if (Number.isNaN(observed.getTime())) {
    return {
      ok: false,
      rejection: 'observed-at-invalid',
      classification: 'suspicious',
      confidence: 0,
      deltaEurPerL: 0,
    };
  }

  // -------- Classification & confidence --------
  let classification: ReportClassification = 'no-known-price';
  let confidence = 0.5; // baseline
  let delta = 0;

  if (typeof input.knownPrice === 'number' && input.knownPrice > 0) {
    delta = Math.abs(input.price - input.knownPrice);
    if (delta < 0.005) classification = 'matches-known';
    else if (delta < 0.03) classification = 'minor-correction';
    else if (delta < 0.10) classification = 'major-correction';
    else classification = 'suspicious';
  }

  // Confidence weights:
  // matches-known        0.95 (trustworthy, but adds little new info)
  // minor-correction     0.75
  // major-correction     0.55
  // suspicious           0.20
  // no-known-price       0.50 (neutral)
  switch (classification) {
    case 'matches-known':       confidence = 0.95; break;
    case 'minor-correction':    confidence = 0.75; break;
    case 'major-correction':    confidence = 0.55; break;
    case 'suspicious':          confidence = 0.20; break;
    case 'no-known-price':      confidence = 0.50; break;
  }

  return {
    ok: true,
    record: {
      stationId,
      fuelType: input.fuelType,
      price: round(input.price, 3),
      observedAt: observed.toISOString(),
    },
    classification,
    confidence,
    deltaEurPerL: round(delta, 3),
  };
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
