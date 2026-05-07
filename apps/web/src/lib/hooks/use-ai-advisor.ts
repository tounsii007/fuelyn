// ============================================================
// TankPilot Web -- AI Advisor Hook (TanStack Query)
// Calls the /api/ai/advisor endpoint to get GPT-4o-mini
// powered fuel recommendations. Falls back gracefully when
// the API is unavailable.
// ============================================================

'use client';

import { useQuery } from '@tanstack/react-query';
import type { FuelType } from '@tankpilot/core';
import type { AIAdvisorResponse } from '@/lib/ai/fuel-advisor-ai';

// ---- Types ----

export interface AIAdvisorParams {
  prices: {
    stationName: string;
    brand: string;
    price: number;
    distance: number;
  }[];
  fuelType: FuelType;
  priceHistory?: { price: number; timestamp: string }[];
  lat?: number;
  lng?: number;
  fillUpLiters?: number;
}

export interface AIAdvisorResult {
  recommendation: AIAdvisorResponse;
  source: 'ai' | 'heuristic';
}

// ---- Helpers ----

/** Round coordinate to 2 decimal places (~1 km precision) for stable cache keys. */
function roundCoord(v?: number): string {
  return v != null ? v.toFixed(2) : '0';
}

async function fetchAIAdvisor(params: AIAdvisorParams): Promise<AIAdvisorResult> {
  const res = await fetch('/api/ai/advisor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prices: params.prices,
      fuelType: params.fuelType,
      priceHistory: params.priceHistory,
      lat: params.lat,
      lng: params.lng,
      fillUpLiters: params.fillUpLiters,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AI advisor request failed (${res.status}): ${text}`);
  }

  return (await res.json()) as AIAdvisorResult;
}

// ---- Hook ----

export function useAIAdvisor(params: AIAdvisorParams) {
  return useQuery<AIAdvisorResult>({
    queryKey: [
      'ai-advisor',
      params.fuelType,
      roundCoord(params.lat),
      roundCoord(params.lng),
    ],
    queryFn: () => fetchAIAdvisor(params),
    staleTime: 15 * 60 * 1000, // 15 min — match server cache TTL
    gcTime: 30 * 60 * 1000,
    enabled: params.prices.length > 0 && params.lat != null && params.lng != null,
    retry: 1,
  });
}
