// ============================================================
// Fuelyn — Gas Station Adapter (LPG / CNG / LNG)
// Curated dataset of gas refueling stations in Germany.
// Data sourced from gas-tankstellen.de public information.
// ============================================================

import type { UnifiedGasStation } from '../../domain/unified-station';
import type { EnergyType } from '../../domain/energy-types';
import { haversineDistance } from '../../utils';
import type { Coordinates } from '../../domain/types';

/** Static gas station entry. */
interface GasStationData {
  readonly name: string;
  readonly operator: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string;
  readonly postCode: string;
  readonly city: string;
  readonly gasTypes: readonly ('lpg' | 'cng' | 'lng')[];
  readonly lpgPrice: number | null;
  readonly cngPrice: number | null;
  readonly lngPrice: number | null;
}

/**
 * Curated sample of gas stations in Germany.
 * LPG (~6,500 stations), CNG (~800 stations), LNG (~100 stations).
 * Prices approximate 2024/2025 averages.
 */
const GAS_STATIONS: readonly GasStationData[] = [
  // ─── LPG Stations (Autogas — widely available) ────
  { name: 'Aral Autogas Berlin Tempelhofer Damm', operator: 'Aral', lat: 52.4670, lng: 13.3900, address: 'Tempelhofer Damm 227', postCode: '12099', city: 'Berlin', gasTypes: ['lpg'], lpgPrice: 0.72, cngPrice: null, lngPrice: null },
  { name: 'Shell Autogas Hamburg Kieler Str.', operator: 'Shell', lat: 53.5880, lng: 9.9540, address: 'Kieler Str. 200', postCode: '22525', city: 'Hamburg', gasTypes: ['lpg'], lpgPrice: 0.71, cngPrice: null, lngPrice: null },
  { name: 'Jet Autogas München Landsberger Str.', operator: 'Jet', lat: 48.1380, lng: 11.5167, address: 'Landsberger Str. 50', postCode: '80339', city: 'München', gasTypes: ['lpg'], lpgPrice: 0.75, cngPrice: null, lngPrice: null },
  { name: 'Star Autogas Köln Aachener Str.', operator: 'Star', lat: 50.9380, lng: 6.8980, address: 'Aachener Str. 999', postCode: '50933', city: 'Köln', gasTypes: ['lpg'], lpgPrice: 0.73, cngPrice: null, lngPrice: null },
  { name: 'Autogas Frankfurt Mainzer Landstr.', operator: 'Esso', lat: 50.1070, lng: 8.6399, address: 'Mainzer Landstr.', postCode: '60329', city: 'Frankfurt', gasTypes: ['lpg'], lpgPrice: 0.74, cngPrice: null, lngPrice: null },
  { name: 'Sprint Autogas Stuttgart', operator: 'Sprint', lat: 48.7520, lng: 9.1900, address: 'Heilbronner Str.', postCode: '70191', city: 'Stuttgart', gasTypes: ['lpg'], lpgPrice: 0.73, cngPrice: null, lngPrice: null },
  { name: 'Shell Autogas Düsseldorf', operator: 'Shell', lat: 51.2220, lng: 6.7890, address: 'Münsterstr.', postCode: '40476', city: 'Düsseldorf', gasTypes: ['lpg'], lpgPrice: 0.72, cngPrice: null, lngPrice: null },
  { name: 'Aral Autogas Hannover', operator: 'Aral', lat: 52.3753, lng: 9.7380, address: 'Podbielskistr.', postCode: '30177', city: 'Hannover', gasTypes: ['lpg'], lpgPrice: 0.70, cngPrice: null, lngPrice: null },
  { name: 'LPG Tankstelle Nürnberg', operator: 'OMV', lat: 49.4500, lng: 11.0780, address: 'Fürther Str.', postCode: '90429', city: 'Nürnberg', gasTypes: ['lpg'], lpgPrice: 0.74, cngPrice: null, lngPrice: null },
  { name: 'LPG Dortmund Rheinlanddamm', operator: 'Star', lat: 51.5080, lng: 7.4800, address: 'Rheinlanddamm', postCode: '44139', city: 'Dortmund', gasTypes: ['lpg'], lpgPrice: 0.71, cngPrice: null, lngPrice: null },
  { name: 'Autogas Leipzig Prager Str.', operator: 'Jet', lat: 51.3150, lng: 12.3900, address: 'Prager Str.', postCode: '04103', city: 'Leipzig', gasTypes: ['lpg'], lpgPrice: 0.69, cngPrice: null, lngPrice: null },
  { name: 'LPG Bremen Heerstr.', operator: 'Aral', lat: 53.0650, lng: 8.7910, address: 'Heerstr.', postCode: '28203', city: 'Bremen', gasTypes: ['lpg'], lpgPrice: 0.70, cngPrice: null, lngPrice: null },

  // ─── CNG Stations (Erdgas — ~800 in Germany) ──────
  { name: 'CNG Berlin Holzmarktstr.', operator: 'GASAG', lat: 52.5130, lng: 13.4210, address: 'Holzmarktstr. 12', postCode: '10179', city: 'Berlin', gasTypes: ['cng'], lpgPrice: null, cngPrice: 1.25, lngPrice: null },
  { name: 'CNG München Moosacher Str.', operator: 'Stadtwerke', lat: 48.1810, lng: 11.5540, address: 'Moosacher Str.', postCode: '80809', city: 'München', gasTypes: ['cng'], lpgPrice: null, cngPrice: 1.30, lngPrice: null },
  { name: 'CNG Erdgas Hamburg Amsinckstr.', operator: 'Hamburg Energie', lat: 53.5440, lng: 10.0120, address: 'Amsinckstr.', postCode: '20097', city: 'Hamburg', gasTypes: ['cng'], lpgPrice: null, cngPrice: 1.28, lngPrice: null },
  { name: 'CNG Köln Bonner Str.', operator: 'RheinEnergie', lat: 50.9120, lng: 6.9640, address: 'Bonner Str.', postCode: '50677', city: 'Köln', gasTypes: ['cng'], lpgPrice: null, cngPrice: 1.26, lngPrice: null },
  { name: 'CNG Stuttgart Neckarstr.', operator: 'EnBW', lat: 48.7750, lng: 9.1830, address: 'Neckarstr.', postCode: '70190', city: 'Stuttgart', gasTypes: ['cng'], lpgPrice: null, cngPrice: 1.32, lngPrice: null },
  { name: 'CNG Frankfurt Gutleutstr.', operator: 'Mainova', lat: 50.1050, lng: 8.6600, address: 'Gutleutstr.', postCode: '60329', city: 'Frankfurt', gasTypes: ['cng'], lpgPrice: null, cngPrice: 1.27, lngPrice: null },
  { name: 'CNG Düsseldorf Oberbilker Allee', operator: 'Stadtwerke', lat: 51.2100, lng: 6.7900, address: 'Oberbilker Allee', postCode: '40227', city: 'Düsseldorf', gasTypes: ['cng'], lpgPrice: null, cngPrice: 1.29, lngPrice: null },
  { name: 'CNG Hannover Podbielskistr.', operator: 'Enercity', lat: 52.3850, lng: 9.7700, address: 'Podbielskistr.', postCode: '30163', city: 'Hannover', gasTypes: ['cng'], lpgPrice: null, cngPrice: 1.24, lngPrice: null },

  // ─── LNG Stations (LKW-fokussiert — ~100 in DE) ───
  { name: 'LNG Shell Dortmund A2', operator: 'Shell', lat: 51.5200, lng: 7.5200, address: 'Autobahn A2', postCode: '44309', city: 'Dortmund', gasTypes: ['lng'], lpgPrice: null, cngPrice: null, lngPrice: 1.55 },
  { name: 'LNG Liqvis Frankfurt A5', operator: 'Liqvis', lat: 50.0900, lng: 8.6100, address: 'Autobahn A5', postCode: '60326', city: 'Frankfurt', gasTypes: ['lng'], lpgPrice: null, cngPrice: null, lngPrice: 1.52 },
  { name: 'LNG TotalEnergies Hamburg A1', operator: 'TotalEnergies', lat: 53.5100, lng: 10.0500, address: 'Autobahn A1', postCode: '21109', city: 'Hamburg', gasTypes: ['lng'], lpgPrice: null, cngPrice: null, lngPrice: 1.58 },
  { name: 'LNG München A8 Süd', operator: 'Shell', lat: 48.0800, lng: 11.6000, address: 'Autobahn A8', postCode: '85521', city: 'München-Süd', gasTypes: ['lng'], lpgPrice: null, cngPrice: null, lngPrice: 1.56 },

  // ─── Kombi (LPG + CNG) ────────────────────────────
  { name: 'Multi-Gas Tankstelle Berlin', operator: 'Aral', lat: 52.5200, lng: 13.4050, address: 'Berliner Allee', postCode: '13088', city: 'Berlin', gasTypes: ['lpg', 'cng'], lpgPrice: 0.71, cngPrice: 1.25, lngPrice: null },
  { name: 'Multi-Gas München Ingolstädter Str.', operator: 'Shell', lat: 48.1900, lng: 11.5800, address: 'Ingolstädter Str.', postCode: '80807', city: 'München', gasTypes: ['lpg', 'cng'], lpgPrice: 0.74, cngPrice: 1.30, lngPrice: null },
] as const;

/**
 * Search gas stations near a given point.
 * Uses haversine distance calculation against the static dataset.
 */
export function searchGasStations(
  lat: number,
  lng: number,
  radiusKm: number,
  gasTypes?: readonly ('lpg' | 'cng' | 'lng')[],
): UnifiedGasStation[] {
  return GAS_STATIONS
    .filter((s) => {
      if (gasTypes && gasTypes.length > 0) {
        return gasTypes.some((gt) => s.gasTypes.includes(gt));
      }
      return true;
    })
    .map((s) => {
      const center: Coordinates = { lat, lng };
      const dist = haversineDistance(center, { lat: s.lat, lng: s.lng });
      return { ...s, dist };
    })
    .filter((s) => s.dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist)
    .map((s): UnifiedGasStation => {
      const energyTypes: EnergyType[] = [];
      if (s.gasTypes.includes('lpg')) energyTypes.push('lpg');
      if (s.gasTypes.includes('cng')) energyTypes.push('cng');
      if (s.gasTypes.includes('lng')) energyTypes.push('lng');

      return {
        id: `gas-${s.city.toLowerCase().replace(/\s+/g, '-')}-${s.lat.toFixed(3)}`,
        name: s.name,
        brand: s.operator,
        lat: s.lat,
        lng: s.lng,
        dist: Math.round(s.dist * 10) / 10,
        address: {
          street: s.address,
          houseNumber: '',
          postCode: s.postCode,
          city: s.city,
        },
        isOpen: true,
        stationType: 'gas',
        energyTypes,
        source: 'gas-static',
        gasTypes: [...s.gasTypes],
        gasPrices: {
          lpg: s.lpgPrice,
          cng: s.cngPrice,
          lng: s.lngPrice,
        },
        operator: s.operator,
      };
    });
}

/** Get all gas stations in Germany. */
export function getAllGasStations(): UnifiedGasStation[] {
  return searchGasStations(51.1657, 10.4515, 600);
}
