// ============================================================
// AI Fuel Advisor — shared response types.
//
// NOTE: the runtime OpenAI-backed implementation that used to live here
// was dead code (never imported anywhere) and shipped a cache whose key
// omitted the prices/history/context inputs — so it could have returned
// one request's advice for another. Only the TYPES below are consumed
// (use-ai-advisor.ts, FuelAdvisor.tsx). The live advisor path is the BFF
// route /api/ai/advisor → Java ai-service with a local heuristic
// fallback, so this file is intentionally types-only.
// ============================================================

import type { FuelType } from '@fuelyn/core';

export interface AIAdvisorInput {
  currentPrices: {
    stationName: string;
    brand: string;
    price: number;
    distance: number;
  }[];
  fuelType: FuelType;
  priceHistory?: { price: number; timestamp: string }[];
  userContext?: {
    fillUpLiters?: number;
    vehicleConsumption?: number;
    dayOfWeek?: string;
    hourOfDay?: number;
  };
}

export interface AIAdvisorResponse {
  action: 'buy_now' | 'wait';
  headline: string;
  explanation: string;
  bestTimePrediction: string;
  savingsEstimate: number;
  confidence: 'high' | 'medium' | 'low';
  bestStation?: {
    name: string;
    reason: string;
  };
  priceOutlook: string;
  tip: string;
}
