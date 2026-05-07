export interface ScoreWeights {
  price: number;
  distance: number;
  reachability: number;
  openStatus: number;
  favorite: number;
}

export interface RecommendationOptions {
  weights?: Partial<ScoreWeights>;
  favoriteIds?: ReadonlySet<string>;
  excludeUnreachable?: boolean;
}
