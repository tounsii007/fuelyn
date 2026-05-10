// ============================================================
// EV charging planner — engine tests.
// ============================================================

import { describe, it, expect } from 'vitest';
import { planChargingSession } from '../ev-charging-planner';

describe('planChargingSession — AC slow charging', () => {
  it('11 kW wallbox, 20%→80% on a 77 kWh battery', () => {
    const r = planChargingSession({
      batteryKwh: 77,
      fromPct: 20,
      toPct: 80,
      chargerKw: 11,
      tariffEurPerKwh: 0.45,
    });
    expect(r.model).toBe('ac-flat');
    expect(r.energyKwh).toBeCloseTo(46.2, 1); // 60% of 77
    // 46.2 kWh / 11 kW = 4.2 h = 252 min
    expect(r.durationMin).toBeCloseTo(252, 0);
    expect(r.costEur).toBeCloseTo(20.79, 2);
    expect(r.averagePowerKw).toBeCloseTo(11, 0);
  });

  it('22 kW exactly is still treated as AC-flat', () => {
    const r = planChargingSession({
      batteryKwh: 50, fromPct: 0, toPct: 100,
      chargerKw: 22, tariffEurPerKwh: 0.40,
    });
    expect(r.model).toBe('ac-flat');
    expect(r.durationMin).toBeCloseTo((50 / 22) * 60, 0);
  });

  it('extends per-100-km columns when consumption supplied', () => {
    const r = planChargingSession({
      batteryKwh: 60, fromPct: 0, toPct: 50,
      chargerKw: 11, tariffEurPerKwh: 0.50,
      consumptionKwhPer100km: 18,
    });
    expect(r.rangeKmGained).toBeCloseTo(30 / 18 * 100, 1); // 166.7 km
    expect(r.costPer100km).toBeCloseTo(9.0, 1); // 30 kWh × 0.50 / range × 100
  });
});

describe('planChargingSession — DC fast charging tapers above 80%', () => {
  it('DC charge 20→80 is faster than 80→100 for the same kWh', () => {
    // 60 kWh on a 75 kWh pack from 20→80 is 45 kWh (full peak).
    // 80→100 on the same pack is 15 kWh — tapered.
    // Despite less energy, the 80→100 leg should not be 1/3 the
    // duration of 20→80 — its rate is much lower.
    const fast = planChargingSession({
      batteryKwh: 75, fromPct: 20, toPct: 80,
      chargerKw: 150, tariffEurPerKwh: 0.55,
    });
    const taper = planChargingSession({
      batteryKwh: 75, fromPct: 80, toPct: 100,
      chargerKw: 150, tariffEurPerKwh: 0.55,
    });
    expect(fast.model).toBe('dc-tapered');
    // 80-100% covers 1/3 the energy of 20-80%, but the tapered
    // average power means duration ratio should be > 0.45 (and
    // a lot more than the 1/3 a flat curve would predict).
    expect(taper.durationMin / fast.durationMin).toBeGreaterThan(0.45);
  });

  it('average DC power below the nominal peak when crossing 80%', () => {
    const r = planChargingSession({
      batteryKwh: 75, fromPct: 50, toPct: 95,
      chargerKw: 150, tariffEurPerKwh: 0.55,
    });
    expect(r.averagePowerKw).toBeLessThan(150);
    expect(r.averagePowerKw).toBeGreaterThan(60);
  });

  it('20→50 on DC charges close to nominal peak', () => {
    const r = planChargingSession({
      batteryKwh: 75, fromPct: 20, toPct: 50,
      chargerKw: 150, tariffEurPerKwh: 0.55,
    });
    // Pure peak segment — should be very close to 150 kW average.
    expect(r.averagePowerKw).toBeGreaterThan(140);
    expect(r.averagePowerKw).toBeLessThanOrEqual(150);
  });
});

describe('planChargingSession — input validation', () => {
  it('returns zeros for fromPct >= toPct', () => {
    const r = planChargingSession({
      batteryKwh: 60, fromPct: 80, toPct: 80,
      chargerKw: 50, tariffEurPerKwh: 0.5,
    });
    expect(r.energyKwh).toBe(0);
    expect(r.durationMin).toBe(0);
    expect(r.costEur).toBe(0);
  });

  it('returns zeros for non-finite battery', () => {
    const r = planChargingSession({
      batteryKwh: Number.NaN, fromPct: 0, toPct: 100,
      chargerKw: 11, tariffEurPerKwh: 0.5,
    });
    expect(r.energyKwh).toBe(0);
    expect(r.durationMin).toBe(0);
  });

  it('returns zeros for tariff < 0', () => {
    const r = planChargingSession({
      batteryKwh: 60, fromPct: 0, toPct: 100,
      chargerKw: 11, tariffEurPerKwh: -0.1,
    });
    expect(r.costEur).toBe(0);
  });

  it('returns zeros when SoC out of [0,100]', () => {
    const r = planChargingSession({
      batteryKwh: 60, fromPct: -5, toPct: 80,
      chargerKw: 11, tariffEurPerKwh: 0.5,
    });
    expect(r.durationMin).toBe(0);
  });

  it('handles tariff = 0 (free charging) gracefully', () => {
    const r = planChargingSession({
      batteryKwh: 60, fromPct: 20, toPct: 80,
      chargerKw: 11, tariffEurPerKwh: 0,
    });
    expect(r.costEur).toBe(0);
    expect(r.durationMin).toBeGreaterThan(0);
  });
});

describe('planChargingSession — invariants', () => {
  it('higher target % monotonically increases cost', () => {
    const a = planChargingSession({
      batteryKwh: 60, fromPct: 0, toPct: 50,
      chargerKw: 11, tariffEurPerKwh: 0.5,
    });
    const b = planChargingSession({
      batteryKwh: 60, fromPct: 0, toPct: 80,
      chargerKw: 11, tariffEurPerKwh: 0.5,
    });
    expect(b.costEur).toBeGreaterThan(a.costEur);
    expect(b.durationMin).toBeGreaterThan(a.durationMin);
  });

  it('faster charger reduces duration for the same energy (within DC limits)', () => {
    const slow = planChargingSession({
      batteryKwh: 75, fromPct: 20, toPct: 80,
      chargerKw: 50, tariffEurPerKwh: 0.55,
    });
    const fast = planChargingSession({
      batteryKwh: 75, fromPct: 20, toPct: 80,
      chargerKw: 150, tariffEurPerKwh: 0.55,
    });
    expect(fast.durationMin).toBeLessThan(slow.durationMin);
    expect(fast.energyKwh).toBeCloseTo(slow.energyKwh, 1);
  });
});
