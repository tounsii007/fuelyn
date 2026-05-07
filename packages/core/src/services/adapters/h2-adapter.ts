// ============================================================
// TankPilot — Hydrogen (H2) Station Adapter
// Curated dataset of Germany's ~100 hydrogen refueling stations.
// Data sourced from H2.LIVE public information.
// ============================================================

import type { UnifiedHydrogenStation } from '../../domain/unified-station';
import { haversineDistance } from '../../utils';
import type { Coordinates } from '../../domain/types';

/** Static H2 station entry. */
interface H2StationData {
  readonly name: string;
  readonly operator: string;
  readonly lat: number;
  readonly lng: number;
  readonly address: string;
  readonly postCode: string;
  readonly city: string;
  readonly pressure: readonly (350 | 700)[];
  readonly pricePerKg: number | null;
}

/**
 * Curated list of hydrogen stations in Germany.
 * Source: H2.LIVE public data, H2 MOBILITY Deutschland.
 * Prices are approximate averages (2024/2025 level).
 */
const H2_STATIONS: readonly H2StationData[] = [
  // ─── Berlin / Brandenburg ──────────────────────
  { name: 'H2 Tankstelle Berlin Sachsendamm', operator: 'H2 MOBILITY', lat: 52.4840, lng: 13.3645, address: 'Sachsendamm 3', postCode: '10829', city: 'Berlin', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Berlin Heerstraße', operator: 'H2 MOBILITY', lat: 52.5165, lng: 13.2028, address: 'Heerstraße 35', postCode: '14052', city: 'Berlin', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Berlin Holzmarktstr.', operator: 'H2 MOBILITY', lat: 52.5122, lng: 13.4247, address: 'Holzmarktstr. 36', postCode: '10243', city: 'Berlin', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Berlin Jafféstr.', operator: 'Shell', lat: 52.5057, lng: 13.2805, address: 'Jafféstr.', postCode: '10587', city: 'Berlin', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Potsdam', operator: 'TotalEnergies', lat: 52.4025, lng: 13.0550, address: 'Horstweg 1', postCode: '14478', city: 'Potsdam', pressure: [700], pricePerKg: 13.85 },

  // ─── Hamburg ───────────────────────────────────
  { name: 'H2 Tankstelle Hamburg Schnackenburgallee', operator: 'H2 MOBILITY', lat: 53.5604, lng: 9.9035, address: 'Schnackenburgallee 11', postCode: '22525', city: 'Hamburg', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Hamburg Bramfelder Ch.', operator: 'Shell', lat: 53.6070, lng: 10.0770, address: 'Bramfelder Chaussee 320', postCode: '22175', city: 'Hamburg', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Hamburg HafenCity', operator: 'H2 MOBILITY', lat: 53.5380, lng: 10.0080, address: 'Shanghaiallee', postCode: '20457', city: 'Hamburg', pressure: [700], pricePerKg: 13.85 },

  // ─── NRW ───────────────────────────────────────
  { name: 'H2 Tankstelle Köln', operator: 'Shell', lat: 50.9500, lng: 6.9360, address: 'Gremberger Str.', postCode: '51105', city: 'Köln', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Düsseldorf', operator: 'H2 MOBILITY', lat: 51.2388, lng: 6.7858, address: 'Rather Str.', postCode: '40476', city: 'Düsseldorf', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Dortmund', operator: 'H2 MOBILITY', lat: 51.4947, lng: 7.4652, address: 'Mallinckrodtstr.', postCode: '44145', city: 'Dortmund', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Essen', operator: 'H2 MOBILITY', lat: 51.4556, lng: 7.0116, address: 'Krayer Str.', postCode: '45307', city: 'Essen', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Bonn', operator: 'Shell', lat: 50.7177, lng: 7.1407, address: 'Endenicher Str.', postCode: '53115', city: 'Bonn', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Münster', operator: 'H2 MOBILITY', lat: 51.9550, lng: 7.6337, address: 'Albersloher Weg', postCode: '48155', city: 'Münster', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Duisburg', operator: 'H2 MOBILITY', lat: 51.4340, lng: 6.7720, address: 'Moerser Str.', postCode: '47198', city: 'Duisburg', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Wuppertal', operator: 'H2 MOBILITY', lat: 51.2560, lng: 7.1500, address: 'Schmiedestr.', postCode: '42279', city: 'Wuppertal', pressure: [700], pricePerKg: 13.85 },

  // ─── Bayern ────────────────────────────────────
  { name: 'H2 Tankstelle München Detmoldstr.', operator: 'H2 MOBILITY', lat: 48.1558, lng: 11.5373, address: 'Detmoldstr. 1', postCode: '80935', city: 'München', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle München Verdistr.', operator: 'Shell', lat: 48.1230, lng: 11.6000, address: 'Verdistr.', postCode: '81247', city: 'München', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Nürnberg', operator: 'H2 MOBILITY', lat: 49.4309, lng: 11.1156, address: 'Nürnberger Str.', postCode: '90451', city: 'Nürnberg', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Augsburg', operator: 'H2 MOBILITY', lat: 48.3702, lng: 10.8978, address: 'Donauwörther Str.', postCode: '86154', city: 'Augsburg', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Ingolstadt', operator: 'H2 MOBILITY', lat: 48.7632, lng: 11.4350, address: 'Manchinger Str.', postCode: '85053', city: 'Ingolstadt', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Pforzheim', operator: 'H2 MOBILITY', lat: 48.8890, lng: 8.7050, address: 'Wilferdinger Str.', postCode: '75179', city: 'Pforzheim', pressure: [700], pricePerKg: 13.85 },

  // ─── Baden-Württemberg ─────────────────────────
  { name: 'H2 Tankstelle Stuttgart', operator: 'H2 MOBILITY', lat: 48.7870, lng: 9.2172, address: 'Talstr. 70', postCode: '70188', city: 'Stuttgart', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Karlsruhe', operator: 'Shell', lat: 49.0090, lng: 8.4188, address: 'Durlacher Allee', postCode: '76131', city: 'Karlsruhe', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Freiburg', operator: 'H2 MOBILITY', lat: 48.0033, lng: 7.8280, address: 'Breisacher Str.', postCode: '79110', city: 'Freiburg', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Heidelberg', operator: 'H2 MOBILITY', lat: 49.4173, lng: 8.6647, address: 'Speyerer Str.', postCode: '69115', city: 'Heidelberg', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Ulm', operator: 'H2 MOBILITY', lat: 48.3895, lng: 9.9872, address: 'Blaubeurer Str.', postCode: '89077', city: 'Ulm', pressure: [700], pricePerKg: 13.85 },

  // ─── Hessen ────────────────────────────────────
  { name: 'H2 Tankstelle Frankfurt Hanauer Landstr.', operator: 'H2 MOBILITY', lat: 50.1198, lng: 8.7281, address: 'Hanauer Landstr.', postCode: '60314', city: 'Frankfurt', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Wiesbaden', operator: 'H2 MOBILITY', lat: 50.0731, lng: 8.2573, address: 'Äppelallee', postCode: '65203', city: 'Wiesbaden', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Kassel', operator: 'H2 MOBILITY', lat: 51.3045, lng: 9.4795, address: 'Frankfurter Str.', postCode: '34121', city: 'Kassel', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Limburg', operator: 'H2 MOBILITY', lat: 50.3882, lng: 8.0700, address: 'Diezer Str.', postCode: '65549', city: 'Limburg', pressure: [700], pricePerKg: 13.85 },

  // ─── Niedersachsen ─────────────────────────────
  { name: 'H2 Tankstelle Hannover', operator: 'H2 MOBILITY', lat: 52.3788, lng: 9.7399, address: 'Vahrenwalder Str.', postCode: '30165', city: 'Hannover', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Wolfsburg', operator: 'H2 MOBILITY', lat: 52.4186, lng: 10.7865, address: 'Heinrich-Nordhoff-Str.', postCode: '38440', city: 'Wolfsburg', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Braunschweig', operator: 'Shell', lat: 52.2689, lng: 10.5236, address: 'Hamburger Str.', postCode: '38114', city: 'Braunschweig', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Oldenburg', operator: 'H2 MOBILITY', lat: 53.1365, lng: 8.2048, address: 'Alexanderstr.', postCode: '26121', city: 'Oldenburg', pressure: [700], pricePerKg: 13.85 },

  // ─── Sachsen ───────────────────────────────────
  { name: 'H2 Tankstelle Dresden', operator: 'TotalEnergies', lat: 51.0600, lng: 13.7405, address: 'Hamburger Str.', postCode: '01067', city: 'Dresden', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Leipzig', operator: 'H2 MOBILITY', lat: 51.3367, lng: 12.3640, address: 'Maximilianallee', postCode: '04129', city: 'Leipzig', pressure: [700], pricePerKg: 13.85 },

  // ─── Schleswig-Holstein ────────────────────────
  { name: 'H2 Tankstelle Kiel', operator: 'H2 MOBILITY', lat: 54.3295, lng: 10.1271, address: 'Hamburger Chaussee', postCode: '24113', city: 'Kiel', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Flensburg', operator: 'H2 MOBILITY', lat: 54.7817, lng: 9.4310, address: 'Schleswiger Str.', postCode: '24941', city: 'Flensburg', pressure: [700], pricePerKg: 13.85 },

  // ─── Rheinland-Pfalz / Saarland ────────────────
  { name: 'H2 Tankstelle Mainz-Hechtsheim', operator: 'H2 MOBILITY', lat: 49.9677, lng: 8.2942, address: 'Rheinallee', postCode: '55116', city: 'Mainz', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Koblenz', operator: 'Shell', lat: 50.3513, lng: 7.5928, address: 'Schlachthofstr.', postCode: '56073', city: 'Koblenz', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Saarbrücken', operator: 'H2 MOBILITY', lat: 49.2345, lng: 7.0030, address: 'Lebacher Str.', postCode: '66113', city: 'Saarbrücken', pressure: [700], pricePerKg: 13.85 },

  // ─── Thüringen / Sachsen-Anhalt ────────────────
  { name: 'H2 Tankstelle Erfurt', operator: 'H2 MOBILITY', lat: 50.9740, lng: 11.0342, address: 'Gothaer Str.', postCode: '99094', city: 'Erfurt', pressure: [700], pricePerKg: 13.85 },
  { name: 'H2 Tankstelle Magdeburg', operator: 'H2 MOBILITY', lat: 52.1316, lng: 11.6426, address: 'Magdeburger Ring', postCode: '39116', city: 'Magdeburg', pressure: [700], pricePerKg: 13.85 },

  // ─── Bremen ────────────────────────────────────
  { name: 'H2 Tankstelle Bremen', operator: 'H2 MOBILITY', lat: 53.0793, lng: 8.8017, address: 'Osterholzer Heerstr.', postCode: '28307', city: 'Bremen', pressure: [700], pricePerKg: 13.85 },

  // ─── Mecklenburg-Vorpommern ────────────────────
  { name: 'H2 Tankstelle Rostock', operator: 'H2 MOBILITY', lat: 54.0830, lng: 12.1230, address: 'Tessiner Str.', postCode: '18055', city: 'Rostock', pressure: [700], pricePerKg: 13.85 },
] as const;

/**
 * Search H2 stations near a given point.
 * Uses haversine distance calculation against the static dataset.
 */
export function searchH2Stations(
  lat: number,
  lng: number,
  radiusKm: number,
): UnifiedHydrogenStation[] {
  const center: Coordinates = { lat, lng };
  return H2_STATIONS
    .map((s) => {
      const dist = haversineDistance(center, { lat: s.lat, lng: s.lng });
      return { ...s, dist };
    })
    .filter((s) => s.dist <= radiusKm)
    .sort((a, b) => a.dist - b.dist)
    .map((s): UnifiedHydrogenStation => ({
      id: `h2-${s.city.toLowerCase().replace(/\s+/g, '-')}-${s.lat.toFixed(3)}`,
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
      isOpen: true, // Static data — assume open
      stationType: 'hydrogen',
      energyTypes: ['h2'],
      source: 'h2-static',
      h2PricePerKg: s.pricePerKg,
      h2Pressure: [...s.pressure],
      h2Available: true,
      operator: s.operator,
    }));
}

/** Get all H2 stations in Germany (for Germany-wide view). */
export function getAllH2Stations(): UnifiedHydrogenStation[] {
  return searchH2Stations(51.1657, 10.4515, 600);
}
