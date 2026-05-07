export {
  haversineKm,
  equirectangularKm,
  isInsideCircle,
  boundingBoxKm,
  EARTH_RADIUS_KM,
} from './distance';
export type { LatLng, BoundingBox } from './distance';

export { evaluateFences, isGeoFence } from './fence';
export type {
  GeoFence,
  StationPriceSnapshot,
  FenceEngineState,
  FenceEvent,
  EvaluationResult,
  EvaluateOptions,
} from './fence';
