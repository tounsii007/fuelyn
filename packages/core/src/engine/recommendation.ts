import type { FuelType, Station, StationRecommendation, VehicleProfile } from '../domain/types';
import { AVERAGE_SPEED_KMH, SCORE_WEIGHTS } from '../config/constants';
import {
  computeReachability,
  computeRemainingRange,
  estimateDriveTime,
  estimateFuelCost,
} from './range';
import { getPriceForFuel } from './recommendation-helpers';
import { buildRecommendationReasons } from './recommendation-reasons';
import { computeScores } from './recommendation-scorer';
import type { RecommendationOptions, ScoreWeights } from './recommendation-types';

export type { RecommendationOptions, ScoreWeights } from './recommendation-types';

export function computeRecommendations(
  stations: readonly Station[],
  vehicle: VehicleProfile | null,
  options: RecommendationOptions = {},
): StationRecommendation[] {
  const weights: ScoreWeights = { ...SCORE_WEIGHTS, ...options.weights };
  const favoriteIds = options.favoriteIds ?? new Set<string>();
  const remainingRange = vehicle ? computeRemainingRange(vehicle) : null;
  const fuelType: FuelType = vehicle?.fuelType ?? 'e10';
  const consumption = vehicle?.consumption ?? 7;

  const prices = stations
    .map((station) => getPriceForFuel(station, fuelType))
    .filter((price): price is number => price != null);
  const distances = stations.map((station) => station.dist);
  const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : 1;
  const maxDistance = distances.length > 0 ? Math.max(...distances) : 1;

  const scored: StationRecommendation[] = stations.map((station) => {
    const price = getPriceForFuel(station, fuelType);
    const reachability = computeReachability(station.dist, remainingRange);
    const driveTime = estimateDriveTime(station.dist, AVERAGE_SPEED_KMH);
    const fuelCost = estimateFuelCost(station.dist, consumption, price);
    const isFavorite = favoriteIds.has(station.id);
    const scores = computeScores({
      price,
      minPrice,
      maxPrice,
      distance: station.dist,
      maxDistance,
      isOpen: station.isOpen,
      reachability,
      isFavorite,
      weights,
    });

    return {
      station,
      scores,
      reachabilityStatus: reachability,
      estimatedFuelCost: fuelCost,
      estimatedDriveTime: driveTime,
      rank: 0,
      isBestOption: false,
      reasons: buildRecommendationReasons(
        station,
        scores,
        reachability,
        price,
        minPrice,
        isFavorite,
      ),
    };
  });

  const filtered = options.excludeUnreachable
    ? scored.filter((recommendation) => recommendation.reachabilityStatus !== 'unreachable')
    : scored;

  filtered.sort((left, right) => right.scores.overall - left.scores.overall);

  return filtered.map((recommendation, index) => ({
    ...recommendation,
    rank: index + 1,
    isBestOption: index === 0,
  }));
}

export {
  computeRemainingRange,
  computeReachability,
  estimateFuelCost,
  estimateDriveTime,
} from './range';
