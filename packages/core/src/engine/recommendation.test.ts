import { describe, expect, it } from 'vitest';
import type { Station, VehicleProfile } from '../domain/types';
import { computeRecommendations } from './recommendation';

const stations: Station[] = [
  {
    id: 'a',
    name: 'Alpha',
    brand: 'A',
    street: 'One',
    houseNumber: '1',
    postCode: '10115',
    place: 'Berlin',
    lat: 52.5,
    lng: 13.4,
    dist: 2,
    prices: { diesel: 1.7, e5: 1.8, e10: 1.6 },
    isOpen: true,
  },
  {
    id: 'b',
    name: 'Beta',
    brand: 'B',
    street: 'Two',
    houseNumber: '2',
    postCode: '10115',
    place: 'Berlin',
    lat: 52.51,
    lng: 13.41,
    dist: 8,
    prices: { diesel: 1.9, e5: 2.0, e10: 1.9 },
    isOpen: false,
  },
];

const vehicle: VehicleProfile = {
  id: 'v1',
  name: 'Car',
  fuelType: 'e10',
  consumption: 6,
  tankCapacity: 50,
  currentRange: 20,
  currentFuelLevel: null,
  currentFuelUnit: 'km',
};

describe('computeRecommendations', () => {
  it('ranks the strongest station first and marks the best option', () => {
    const recommendations = computeRecommendations(stations, vehicle, {
      favoriteIds: new Set(['a']),
    });

    expect(recommendations[0]?.station.id).toBe('a');
    expect(recommendations[0]?.isBestOption).toBe(true);
    expect(recommendations[0]?.reasons).toContain('Favorit');
  });

  it('filters unreachable stations when requested', () => {
    const recommendations = computeRecommendations(stations, { ...vehicle, currentRange: 5 }, {
      excludeUnreachable: true,
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]?.station.id).toBe('a');
  });
});
