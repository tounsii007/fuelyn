import type { Coordinates } from '../../domain/types';

export type ManeuverType =
  | 'depart'
  | 'arrive'
  | 'turn-left'
  | 'turn-right'
  | 'turn-slight-left'
  | 'turn-slight-right'
  | 'turn-sharp-left'
  | 'turn-sharp-right'
  | 'continue'
  | 'merge'
  | 'on-ramp'
  | 'off-ramp'
  | 'fork-left'
  | 'fork-right'
  | 'roundabout'
  | 'uturn'
  | 'end-of-road-left'
  | 'end-of-road-right'
  | 'unknown';

export interface RouteManeuver {
  readonly type: ManeuverType;
  readonly location: Coordinates;
  readonly bearingAfter: number;
}

export interface RouteStep {
  readonly distance: number;
  readonly duration: number;
  readonly name: string;
  readonly maneuver: RouteManeuver;
  readonly geometry: readonly [number, number][];
  readonly instruction: string;
}

export interface RouteData {
  readonly coordinates: readonly [number, number][];
  readonly distanceMeters: number;
  readonly durationSeconds: number;
  readonly steps: readonly RouteStep[];
}
