import { describe, expect, it } from 'vitest';
import {
  haversineKm,
  equirectangularKm,
  isInsideCircle,
  boundingBoxKm,
} from './distance';

const BERLIN = { lat: 52.52, lng: 13.405 };
const HAMBURG = { lat: 53.5511, lng: 9.9937 };
const MUNICH = { lat: 48.1351, lng: 11.582 };

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(BERLIN, BERLIN)).toBe(0);
  });

  it('Berlin → Hamburg ≈ 255 km', () => {
    expect(haversineKm(BERLIN, HAMBURG)).toBeCloseTo(255, 0);
  });

  it('Berlin → Munich ≈ 504 km', () => {
    expect(haversineKm(BERLIN, MUNICH)).toBeCloseTo(504, 0);
  });

  it('symmetric', () => {
    expect(haversineKm(BERLIN, MUNICH)).toBeCloseTo(haversineKm(MUNICH, BERLIN), 5);
  });
});

describe('equirectangularKm', () => {
  it('agrees with haversine within 0.5 % at small distances', () => {
    const a = { lat: 52.52, lng: 13.405 };
    const b = { lat: 52.51, lng: 13.42 };
    const h = haversineKm(a, b);
    const e = equirectangularKm(a, b);
    expect(Math.abs(h - e) / h).toBeLessThan(0.005);
  });
});

describe('isInsideCircle', () => {
  it('center is inside any positive radius', () => {
    expect(isInsideCircle(BERLIN, BERLIN, 0.001)).toBe(true);
  });

  it('Hamburg is NOT within 100 km of Berlin', () => {
    expect(isInsideCircle(HAMBURG, BERLIN, 100)).toBe(false);
  });

  it('a point 1 km away is inside a 5 km fence', () => {
    const near = { lat: BERLIN.lat + 0.005, lng: BERLIN.lng };
    expect(isInsideCircle(near, BERLIN, 5)).toBe(true);
  });

  it('a point 6 km away is outside a 5 km fence', () => {
    // 0.06° lat ≈ 6.7 km
    const far = { lat: BERLIN.lat + 0.06, lng: BERLIN.lng };
    expect(isInsideCircle(far, BERLIN, 5)).toBe(false);
  });
});

describe('boundingBoxKm', () => {
  it('produces a box covering the radius', () => {
    const bb = boundingBoxKm(BERLIN, 10);
    expect(bb.minLat).toBeLessThan(BERLIN.lat);
    expect(bb.maxLat).toBeGreaterThan(BERLIN.lat);
    expect(bb.minLng).toBeLessThan(BERLIN.lng);
    expect(bb.maxLng).toBeGreaterThan(BERLIN.lng);
  });

  it('latitude span is roughly 2 × radius / 111', () => {
    const bb = boundingBoxKm(BERLIN, 10);
    const span = bb.maxLat - bb.minLat;
    expect(span).toBeCloseTo(0.18, 2);
  });
});
