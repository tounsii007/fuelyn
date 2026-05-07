import type { FuelType, Station } from '../domain/types';

export function getPriceForFuel(station: Station, fuelType: FuelType): number | null {
  if (!station.prices) return null;
  return station.prices[fuelType] ?? null;
}

export function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
