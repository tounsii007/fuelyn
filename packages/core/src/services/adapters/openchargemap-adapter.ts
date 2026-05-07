// ============================================================
// TankPilot — OpenChargeMap Adapter
// Maps raw OpenChargeMap data into UnifiedChargingStation format.
// ============================================================

import type { ChargingStation, ChargingConnection } from '../../domain/types';
import type { UnifiedChargingStation, UnifiedChargingConnection } from '../../domain/unified-station';
import type { ConnectorType, ChargingSpeed, EnergyType } from '../../domain/energy-types';
import { classifyChargingSpeed } from '../../domain/energy-types';

/** Map a connector type string to our standardized ConnectorType. */
export function normalizeConnectorType(typeString: string): ConnectorType {
  const lower = typeString.toLowerCase();
  if (lower.includes('typ 2') || lower.includes('type 2') || lower.includes('mennekes')) return 'type2';
  if (lower.includes('ccs') || lower.includes('combo')) return 'ccs';
  if (lower.includes('chademo')) return 'chademo';
  if (lower.includes('schuko') || lower.includes('haushalt')) return 'schuko';
  if (lower.includes('typ 1') || lower.includes('type 1') || lower.includes('j1772')) return 'type1';
  if (lower.includes('tesla') || lower.includes('supercharger')) return 'tesla_supercharger';
  return 'other';
}

/** Map a ChargingConnection to UnifiedChargingConnection. */
function mapConnection(conn: ChargingConnection): UnifiedChargingConnection {
  const connectorType = normalizeConnectorType(conn.type);
  const speed = classifyChargingSpeed(conn.powerKW);

  return {
    connectorType,
    connectorLabel: conn.type,
    powerKW: conn.powerKW,
    quantity: conn.quantity,
    chargingSpeed: speed,
  };
}

/** Derive energy types from connections. */
function deriveEnergyTypes(connections: readonly UnifiedChargingConnection[]): EnergyType[] {
  const types = new Set<EnergyType>();
  for (const conn of connections) {
    switch (conn.chargingSpeed) {
      case 'ac':
        types.add('ev_ac');
        break;
      case 'dc':
        types.add('ev_dc');
        break;
      case 'hpc':
        types.add('ev_hpc');
        break;
    }
  }
  return Array.from(types);
}

/** Derive charging speed tiers from connections. */
function deriveChargingTypes(connections: readonly UnifiedChargingConnection[]): ChargingSpeed[] {
  const types = new Set<ChargingSpeed>();
  for (const conn of connections) {
    types.add(conn.chargingSpeed);
  }
  return Array.from(types);
}

/**
 * Map a ChargingStation (from existing hook/API) to UnifiedChargingStation.
 */
export function mapChargingToUnified(station: ChargingStation): UnifiedChargingStation {
  const connections = station.connections.map(mapConnection);
  const energyTypes = deriveEnergyTypes(connections);
  const chargingTypes = deriveChargingTypes(connections);
  const powers = connections
    .map((c) => c.powerKW)
    .filter((p): p is number => p != null);
  const maxPowerKW = powers.length > 0 ? Math.max(...powers) : null;
  const totalPoints = connections.reduce((sum, c) => sum + c.quantity, 0);

  return {
    id: `ocm-${station.id}`,
    name: station.name || station.operator || 'Ladestation',
    brand: station.operator || '',
    lat: station.lat,
    lng: station.lng,
    dist: station.dist,
    address: {
      street: station.address,
      houseNumber: '',
      postCode: station.postCode,
      city: station.city,
    },
    isOpen: station.isOperational,
    stationType: 'charging',
    energyTypes,
    source: 'openchargemap',
    connections,
    operator: station.operator,
    usageCost: station.usageCost,
    accessType: station.accessType,
    chargingTypes,
    maxPowerKW,
    totalPoints,
    isOperational: station.isOperational,
  };
}

/**
 * Map a batch of ChargingStation objects to UnifiedChargingStation[].
 */
export function mapChargingStationsToUnified(
  stations: readonly ChargingStation[],
): UnifiedChargingStation[] {
  return stations.map(mapChargingToUnified);
}
