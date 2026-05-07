import type { ManeuverType, RouteData, RouteStep } from './route-types';
import type { OsrmRouteResponse } from './route-schema';

function toLatLng([lng, lat]: readonly [number, number]): [number, number] {
  return [lat, lng];
}

export function parseManeuverType(type: string, modifier?: string): ManeuverType {
  if (type === 'depart') return 'depart';
  if (type === 'arrive') return 'arrive';
  if (type === 'roundabout' || type === 'rotary') return 'roundabout';
  if (type === 'merge') return 'merge';
  if (type === 'on ramp') return 'on-ramp';
  if (type === 'off ramp') return 'off-ramp';

  if (type === 'fork') {
    return modifier === 'left' ? 'fork-left' : 'fork-right';
  }

  if (type === 'end of road') {
    return modifier === 'left' ? 'end-of-road-left' : 'end-of-road-right';
  }

  if (type === 'turn' || type === 'new name' || type === 'continue') {
    switch (modifier) {
      case 'left': return 'turn-left';
      case 'right': return 'turn-right';
      case 'slight left': return 'turn-slight-left';
      case 'slight right': return 'turn-slight-right';
      case 'sharp left': return 'turn-sharp-left';
      case 'sharp right': return 'turn-sharp-right';
      case 'uturn': return 'uturn';
      case 'straight': return 'continue';
      default: return 'continue';
    }
  }

  return 'unknown';
}

export function buildInstruction(maneuverType: ManeuverType, streetName: string): string {
  const street = streetName || 'der Straße';
  const ontoStreet = streetName ? ` auf ${street}` : '';

  switch (maneuverType) {
    case 'depart': return `Starten Sie${ontoStreet}`;
    case 'arrive': return 'Sie haben Ihr Ziel erreicht';
    case 'turn-left': return `Links abbiegen${ontoStreet}`;
    case 'turn-right': return `Rechts abbiegen${ontoStreet}`;
    case 'turn-slight-left': return `Leicht links${ontoStreet}`;
    case 'turn-slight-right': return `Leicht rechts${ontoStreet}`;
    case 'turn-sharp-left': return `Scharf links${ontoStreet}`;
    case 'turn-sharp-right': return `Scharf rechts${ontoStreet}`;
    case 'continue': return `Weiter${ontoStreet}`;
    case 'merge': return `Einfädeln${ontoStreet}`;
    case 'on-ramp': return `Auffahrt nehmen${ontoStreet}`;
    case 'off-ramp': return `Abfahrt nehmen${ontoStreet}`;
    case 'fork-left': return `Links halten${ontoStreet}`;
    case 'fork-right': return `Rechts halten${ontoStreet}`;
    case 'roundabout': return `Im Kreisverkehr${ontoStreet}`;
    case 'uturn': return 'Bitte wenden';
    case 'end-of-road-left': return `Am Ende links${ontoStreet}`;
    case 'end-of-road-right': return `Am Ende rechts${ontoStreet}`;
    default: return `Weiter${ontoStreet}`;
  }
}

export function mapOsrmRouteData(data: OsrmRouteResponse): RouteData {
  const route = data.routes[0]!;
  const coordinates = route.geometry.coordinates.map(toLatLng);
  const steps: RouteStep[] = route.legs[0]?.steps.map((step) => {
    const maneuverType = parseManeuverType(step.maneuver.type, step.maneuver.modifier);

    return {
      distance: step.distance,
      duration: step.duration,
      name: step.name,
      maneuver: {
        type: maneuverType,
        location: {
          lat: step.maneuver.location?.[1] ?? 0,
          lng: step.maneuver.location?.[0] ?? 0,
        },
        bearingAfter: step.maneuver.bearing_after,
      },
      geometry: step.geometry?.coordinates.map(toLatLng) ?? [],
      instruction: buildInstruction(maneuverType, step.name),
    };
  }) ?? [];

  return {
    coordinates,
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    steps,
  };
}
