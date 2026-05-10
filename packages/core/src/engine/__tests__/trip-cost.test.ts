import { describe, it, expect } from 'vitest';
import { estimateTripCost, haversineDistanceKm } from '../trip-cost';

const HAMBURG = { lat: 53.5511, lng: 9.9937 };
const BERLIN = { lat: 52.5200, lng: 13.4050 };

describe('haversineDistanceKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistanceKm(HAMBURG, HAMBURG)).toBe(0);
  });

  it('matches the textbook Hamburg → Berlin distance (~255 km)', () => {
    const d = haversineDistanceKm(HAMBURG, BERLIN);
    expect(d).toBeGreaterThan(250);
    expect(d).toBeLessThan(260);
  });
});

describe('estimateTripCost — input guards', () => {
  it('returns null when consumption is missing', () => {
    expect(
      estimateTripCost({
        start: HAMBURG,
        end: BERLIN,
        vehicle: { consumption: null, fuelType: 'diesel', tankCapacity: 50 },
        pricePerLiter: 1.8,
      }),
    ).toBeNull();
  });

  it('returns null when price is invalid', () => {
    expect(
      estimateTripCost({
        start: HAMBURG,
        end: BERLIN,
        vehicle: { consumption: 6, fuelType: 'diesel', tankCapacity: 50 },
        pricePerLiter: 0,
      }),
    ).toBeNull();
  });
});

describe('estimateTripCost — happy path', () => {
  it('uses Haversine when no road distance given', () => {
    const r = estimateTripCost({
      start: HAMBURG,
      end: BERLIN,
      vehicle: { consumption: 6, fuelType: 'diesel', tankCapacity: 50 },
      pricePerLiter: 1.8,
    });
    expect(r).not.toBeNull();
    expect(r!.distanceMode).toBe('haversine');
    expect(r!.distanceKm).toBeGreaterThan(250);
    expect(r!.distanceKm).toBeLessThan(260);
    // 255 km × 6 L/100km = 15.3 L × €1.80 = €27.54
    expect(r!.litersNeeded).toBeCloseTo(15.3, 0);
    expect(r!.costEur).toBeGreaterThan(25);
    expect(r!.costEur).toBeLessThan(30);
  });

  it('prefers road distance when supplied + plausible', () => {
    const r = estimateTripCost({
      start: HAMBURG,
      end: BERLIN,
      roadDistanceKm: 290, // realistic for the autobahn route
      vehicle: { consumption: 6, fuelType: 'diesel', tankCapacity: 50 },
      pricePerLiter: 1.8,
    });
    expect(r!.distanceMode).toBe('road');
    expect(r!.distanceKm).toBe(290);
  });

  it('falls back to Haversine if road distance is implausibly long', () => {
    const r = estimateTripCost({
      start: HAMBURG,
      end: BERLIN,
      roadDistanceKm: 5000, // > 3x crow-flies → clipped
      vehicle: { consumption: 6, fuelType: 'diesel', tankCapacity: 50 },
      pricePerLiter: 1.8,
    });
    expect(r!.distanceMode).toBe('haversine');
  });
});

describe('estimateTripCost — round trip + refuel hints', () => {
  it('doubles distance for roundTrip=true', () => {
    const oneWay = estimateTripCost({
      start: HAMBURG, end: BERLIN,
      vehicle: { consumption: 6, fuelType: 'diesel', tankCapacity: 50 },
      pricePerLiter: 1.8,
    });
    const round = estimateTripCost({
      start: HAMBURG, end: BERLIN, roundTrip: true,
      vehicle: { consumption: 6, fuelType: 'diesel', tankCapacity: 50 },
      pricePerLiter: 1.8,
    });
    // Round-trip distance ≈ 2× one-way ± 0.2 km drift from rounding.
    expect(round!.distanceKm).toBeCloseTo(oneWay!.distanceKm * 2, 0);
    expect(round!.costEur).toBeCloseTo(oneWay!.costEur * 2, 0);
    expect(round!.roundTrip).toBe(true);
  });

  it('flags needsRefuel when liters > 80 % of tank capacity', () => {
    // Round-trip Hamburg ↔ Berlin = ~510 km. ×8L/100km = 40.8L.
    // Tank=40L → tankFills=1.02 → needs refuel.
    const r = estimateTripCost({
      start: HAMBURG, end: BERLIN, roundTrip: true,
      vehicle: { consumption: 8, fuelType: 'diesel', tankCapacity: 40 },
      pricePerLiter: 1.8,
    });
    expect(r!.needsRefuel).toBe(true);
    expect(r!.tankFills).toBeGreaterThan(1);
  });

  it('does NOT flag needsRefuel for short trips that fit in one tank', () => {
    const r = estimateTripCost({
      start: HAMBURG, end: BERLIN,
      vehicle: { consumption: 6, fuelType: 'diesel', tankCapacity: 50 },
      pricePerLiter: 1.8,
    });
    // 255km × 6 = 15.3L, well under 50L tank
    expect(r!.needsRefuel).toBe(false);
  });
});

describe('estimateTripCost — CO₂', () => {
  it('uses the diesel CO₂ factor', () => {
    const r = estimateTripCost({
      start: HAMBURG, end: BERLIN, roadDistanceKm: 100,
      vehicle: { consumption: 6, fuelType: 'diesel', tankCapacity: 50 },
      pricePerLiter: 1.8,
    });
    // 100 km × 6 L/100km = 6 L × 2.65 = 15.9 kg CO₂
    expect(r!.co2Kg).toBeCloseTo(15.9, 1);
  });

  it('uses the e10 CO₂ factor for petrol', () => {
    const r = estimateTripCost({
      start: HAMBURG, end: BERLIN, roadDistanceKm: 100,
      vehicle: { consumption: 7, fuelType: 'e10', tankCapacity: 50 },
      pricePerLiter: 1.7,
    });
    // 7L × 2.21 = 15.47 kg
    expect(r!.co2Kg).toBeCloseTo(15.47, 1);
  });
});
