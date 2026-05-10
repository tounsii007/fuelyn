// ============================================================
// EV Charging Session Planner
//
// Answers: "If I plug in now at SoC=X% with a Y-kW charger, how
// long until I'm at Z%, what does it cost, and what does that
// translate to per 100 km?"
//
// Two charging models, picked automatically from the charger
// power:
//
//   * AC / slow DC (≤ 22 kW): treated as ~constant power. The
//     bottleneck is the on-board charger, not the battery's
//     thermal envelope, so the curve is essentially flat.
//
//   * DC fast charging (> 22 kW): models the typical taper that
//     real CCS chargers exhibit — held at peak between 0-50%,
//     ramped down progressively to ~50% of peak at 80% SoC, and
//     ~25% of peak at 95%. Numbers are conservative averages
//     (Bjørn Nyland 1000-km surveys + ADAC test data); this is
//     a planning tool, not a battery-pack simulator.
//
// Energy consumption is tracked at the BATTERY-INPUT side: the
// session puts X kWh INTO the pack, and the pack already accounts
// for charging losses (≈10% AC, 3-5% DC) on the user's bill since
// that's what the meter at the station reads.
//
// Pure / deterministic. No I/O.
// ============================================================

// -----------------------------------------------------------------
// Types
// -----------------------------------------------------------------

export interface ChargingPlanInputs {
  /** Battery capacity in kWh (usable, not gross). */
  batteryKwh: number;
  /** Current state-of-charge, 0..100. */
  fromPct: number;
  /** Target state-of-charge, 0..100. Must be > fromPct. */
  toPct: number;
  /** Charger nominal peak power in kW. */
  chargerKw: number;
  /** Tariff in €/kWh. */
  tariffEurPerKwh: number;
  /** Optional consumption (kWh/100 km) for the per-100-km column. */
  consumptionKwhPer100km?: number;
}

export interface ChargingPlanResult {
  /** Energy delivered to the battery during the session, kWh. */
  energyKwh: number;
  /** Total session time, minutes. */
  durationMin: number;
  /** Total cost, EUR. */
  costEur: number;
  /**
   * Effective average charging power (energy / time), kW.
   * Lower than nominal for DC sessions that push past 80%.
   */
  averagePowerKw: number;
  /**
   * Range gained from the session, km. Only populated if a
   * consumptionKwhPer100km value was supplied.
   */
  rangeKmGained?: number;
  /** Cost per 100 km of range gained, EUR. */
  costPer100km?: number;
  /** Which curve model was used. */
  model: 'ac-flat' | 'dc-tapered';
}

// -----------------------------------------------------------------
// DC fast-charging taper
//
// Model: piece-wise-linear scaling factor f(soc) ∈ (0, 1] that
// multiplies the nominal charger power to give the instantaneous
// power at that SoC. Roughly approximates a typical 800-V CCS
// curve seen on a 2024 Hyundai Ioniq 5 / Kia EV6 / VW ID.4.
//
//   0-50%   : 1.00  (full peak)
//   50-65%  : 0.85
//   65-80%  : 0.65
//   80-90%  : 0.40
//   90-95%  : 0.25
//   95-100% : 0.15
// -----------------------------------------------------------------

const DC_TAPER: ReadonlyArray<{ soc: number; factor: number }> = [
  { soc: 0,  factor: 1.0 },
  { soc: 50, factor: 1.0 },
  { soc: 65, factor: 0.85 },
  { soc: 80, factor: 0.65 },
  { soc: 90, factor: 0.40 },
  { soc: 95, factor: 0.25 },
  { soc: 100, factor: 0.15 },
];

function powerFactorAtSoc(soc: number): number {
  for (let i = 1; i < DC_TAPER.length; i++) {
    const a = DC_TAPER[i - 1]!;
    const b = DC_TAPER[i]!;
    if (soc <= b.soc) {
      const t = (soc - a.soc) / (b.soc - a.soc);
      return a.factor + (b.factor - a.factor) * t;
    }
  }
  return DC_TAPER[DC_TAPER.length - 1]!.factor;
}

/**
 * Numerically integrate dt = (dE / P_at_soc) over the SoC range.
 * Returns minutes.
 */
function integrateDcTime(
  fromPct: number,
  toPct: number,
  batteryKwh: number,
  peakKw: number,
): number {
  const STEPS = 200; // 0.5%-resolution average — plenty for planning
  const dPct = (toPct - fromPct) / STEPS;
  const dEPerStep = (dPct / 100) * batteryKwh;
  let totalHours = 0;
  for (let i = 0; i < STEPS; i++) {
    const midSoc = fromPct + dPct * (i + 0.5);
    const powerKw = peakKw * powerFactorAtSoc(midSoc);
    if (powerKw <= 0) continue;
    totalHours += dEPerStep / powerKw;
  }
  return totalHours * 60;
}

// -----------------------------------------------------------------
// Public API
// -----------------------------------------------------------------

const DC_THRESHOLD_KW = 22;

export function planChargingSession(inputs: ChargingPlanInputs): ChargingPlanResult {
  const {
    batteryKwh,
    fromPct,
    toPct,
    chargerKw,
    tariffEurPerKwh,
    consumptionKwhPer100km,
  } = inputs;

  if (
    !Number.isFinite(batteryKwh) || batteryKwh <= 0 ||
    !Number.isFinite(chargerKw) || chargerKw <= 0 ||
    !Number.isFinite(tariffEurPerKwh) || tariffEurPerKwh < 0 ||
    !Number.isFinite(fromPct) || !Number.isFinite(toPct) ||
    fromPct < 0 || fromPct > 100 || toPct <= fromPct || toPct > 100
  ) {
    return {
      energyKwh: 0,
      durationMin: 0,
      costEur: 0,
      averagePowerKw: 0,
      model: chargerKw > DC_THRESHOLD_KW ? 'dc-tapered' : 'ac-flat',
    };
  }

  const energyKwh = ((toPct - fromPct) / 100) * batteryKwh;
  const isDc = chargerKw > DC_THRESHOLD_KW;
  const durationMin = isDc
    ? integrateDcTime(fromPct, toPct, batteryKwh, chargerKw)
    : (energyKwh / chargerKw) * 60;
  const averagePowerKw = durationMin > 0 ? (energyKwh / (durationMin / 60)) : 0;
  const costEur = energyKwh * tariffEurPerKwh;

  const result: ChargingPlanResult = {
    energyKwh: round(energyKwh, 2),
    durationMin: round(durationMin, 1),
    costEur: round(costEur, 2),
    averagePowerKw: round(averagePowerKw, 1),
    model: isDc ? 'dc-tapered' : 'ac-flat',
  };

  if (consumptionKwhPer100km && consumptionKwhPer100km > 0) {
    const rangeKm = (energyKwh / consumptionKwhPer100km) * 100;
    result.rangeKmGained = round(rangeKm, 1);
    result.costPer100km = round((costEur / rangeKm) * 100, 2);
  }
  return result;
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
