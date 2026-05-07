import type { RecommendationScores, ReachabilityStatus } from '../domain/types';
import type { ScoreWeights } from './recommendation-types';
import { roundScore } from './recommendation-helpers';

interface ScoreInput {
  price: number | null;
  minPrice: number;
  maxPrice: number;
  distance: number;
  maxDistance: number;
  isOpen: boolean;
  reachability: ReachabilityStatus;
  isFavorite: boolean;
  weights: ScoreWeights;
}

export function computeScores(input: ScoreInput): RecommendationScores {
  const priceScore = computePriceScore(input.price, input.minPrice, input.maxPrice);
  const distanceScore = input.maxDistance > 0 ? 1 - input.distance / input.maxDistance : 1;
  const reachabilityScore = input.reachability === 'safe' ? 1 : input.reachability === 'tight' ? 0.4 : 0;
  const openStatusScore = input.isOpen ? 1 : 0;
  const favoriteScore = input.isFavorite ? 1 : 0;

  const overall =
    priceScore * input.weights.price +
    distanceScore * input.weights.distance +
    reachabilityScore * input.weights.reachability +
    openStatusScore * input.weights.openStatus +
    favoriteScore * input.weights.favorite;

  return {
    price: roundScore(priceScore),
    distance: roundScore(distanceScore),
    reachability: roundScore(reachabilityScore),
    openStatus: roundScore(openStatusScore),
    favorite: roundScore(favoriteScore),
    overall: roundScore(overall),
  };
}

function computePriceScore(price: number | null, minPrice: number, maxPrice: number): number {
  if (price == null) return 0;
  const range = maxPrice - minPrice;
  if (range <= 0) return 1;
  return 1 - (price - minPrice) / range;
}
