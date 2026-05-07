// ============================================================
// TankPilot — Tankerkoenig Adapter
// Wraps the existing StationService and maps Station objects
// to UnifiedFuelStation format.
// ============================================================

import type { Station } from '../../domain/types';
import type { UnifiedFuelStation } from '../../domain/unified-station';

/**
 * Adapt raw Tankerkoenig Station data into UnifiedFuelStation.
 * Can be used both server-side (with StationService) and client-side
 * (with data fetched via BFF routes).
 */
export function mapStationToUnified(station: Station): UnifiedFuelStation {
  const energyTypes: ('diesel' | 'e5' | 'e10')[] = [];
  if (station.prices?.diesel != null) energyTypes.push('diesel');
  if (station.prices?.e5 != null) energyTypes.push('e5');
  if (station.prices?.e10 != null) energyTypes.push('e10');

  // If no prices are available, assume all standard types
  if (energyTypes.length === 0) {
    energyTypes.push('diesel', 'e5', 'e10');
  }

  return {
    id: station.id,
    name: station.name,
    brand: station.brand,
    lat: station.lat,
    lng: station.lng,
    dist: station.dist,
    address: {
      street: station.street,
      houseNumber: station.houseNumber,
      postCode: station.postCode,
      city: station.place,
    },
    isOpen: station.isOpen,
    stationType: 'fuel',
    energyTypes,
    source: 'tankerkoenig',
    prices: station.prices,
  };
}

/**
 * Map a batch of Station objects to UnifiedFuelStation[].
 */
export function mapStationsToUnified(stations: readonly Station[]): UnifiedFuelStation[] {
  return stations.map(mapStationToUnified);
}
