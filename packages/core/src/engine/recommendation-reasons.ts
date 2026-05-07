import type { RecommendationScores, ReachabilityStatus, Station } from '../domain/types';

export function buildRecommendationReasons(
  station: Station,
  scores: RecommendationScores,
  reachability: ReachabilityStatus,
  price: number | null,
  minPrice: number,
  isFavorite: boolean,
): string[] {
  const reasons: string[] = [];

  if (price != null && price === minPrice) {
    reasons.push('Günstigster Preis');
  } else if (scores.price >= 0.8) {
    reasons.push('Sehr günstiger Preis');
  }

  if (scores.distance >= 0.9) {
    reasons.push('Sehr nah');
  } else if (scores.distance >= 0.7) {
    reasons.push('In der Nähe');
  }

  if (station.isOpen) {
    reasons.push('Aktuell geöffnet');
  }

  if (reachability === 'safe') {
    reasons.push('Sicher erreichbar');
  } else if (reachability === 'tight') {
    reasons.push('Knapp erreichbar');
  }

  if (isFavorite) {
    reasons.push('Favorit');
  }

  return reasons;
}
