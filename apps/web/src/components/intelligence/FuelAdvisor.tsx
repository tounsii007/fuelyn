// ============================================================
// FuelAdvisor -- AI-powered refueling recommendation card
// Shows whether the user should refuel now or wait, plus
// best-time prediction, savings estimate, and confidence.
//
// Integration strategy:
//   1. Try AI advisor first (via useAIAdvisor hook)
//   2. While loading: show local heuristic with "KI laedt..." indicator
//   3. When AI responds: replace with AI recommendation + extra fields
//   4. On error: keep showing local heuristic
// ============================================================

'use client';

import { useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { FUEL_TYPE_LABELS } from '@tankpilot/core';
import {
  analyzePrices,
  getMockRecommendation,
} from '@/lib/utils/price-intelligence';
import type { PriceRecommendation, Confidence } from '@/lib/utils/price-intelligence';
import { useAIAdvisor } from '@/lib/hooks/use-ai-advisor';
import type { AIAdvisorResponse } from '@/lib/ai/fuel-advisor-ai';

interface FuelAdvisorProps {
  /** Override fill-up volume (default 50 L). */
  fillUpLiters?: number;
  /** Current station prices for the AI advisor. */
  stationPrices?: {
    stationName: string;
    brand: string;
    price: number;
    distance: number;
  }[];
  className?: string;
}

// ---- Confidence visuals ----

const CONFIDENCE_CONFIG: Record<Confidence, { label: string; color: string; bg: string; dots: number }> = {
  high:   { label: 'Hoch',    color: '#10B981', bg: 'bg-green-50 dark:bg-green-900/20',  dots: 3 },
  medium: { label: 'Mittel',  color: '#F59E0B', bg: 'bg-amber-50 dark:bg-amber-900/20',  dots: 2 },
  low:    { label: 'Niedrig', color: '#94A3B8', bg: 'bg-gray-50 dark:bg-gray-800',       dots: 1 },
};

function ConfidenceDots({ confidence }: { confidence: Confidence }) {
  const cfg = CONFIDENCE_CONFIG[confidence];
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className="w-1.5 h-1.5 rounded-full transition-colors"
          style={{
            backgroundColor: n <= cfg.dots ? cfg.color : '#D1D5DB',
          }}
        />
      ))}
      <span className="text-[10px] font-medium ml-0.5" style={{ color: cfg.color }}>
        {cfg.label}
      </span>
    </div>
  );
}

// ---- Shimmer placeholder for loading state ----

function ShimmerLine({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-gray-200 dark:bg-gray-700 ${className}`}
    />
  );
}

export function FuelAdvisor({
  fillUpLiters = 50,
  stationPrices,
  className = '',
}: FuelAdvisorProps) {
  const priceHistory = useAppStore((s) => s.priceHistory);
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const userLocation = useAppStore((s) => s.userLocation);

  // ---- Local heuristic (always available) ----

  const localRecommendation: PriceRecommendation = useMemo(() => {
    const fuelData = priceHistory
      .filter((p) => p.fuelType === fuelType && Number.isFinite(p.price))
      .map((p) => ({ price: p.price, timestamp: p.timestamp }));

    if (fuelData.length >= 4) {
      return analyzePrices(fuelData, fuelType, fillUpLiters);
    }

    return getMockRecommendation(fuelType, fillUpLiters);
  }, [priceHistory, fuelType, fillUpLiters]);

  // ---- AI advisor (async, optional enhancement) ----

  const historyForAI = useMemo(() => {
    return priceHistory
      .filter((p) => p.fuelType === fuelType && Number.isFinite(p.price))
      .map((p) => ({ price: p.price, timestamp: p.timestamp }));
  }, [priceHistory, fuelType]);

  const {
    data: aiResult,
    isLoading: aiLoading,
    isError: aiError,
  } = useAIAdvisor({
    prices: stationPrices ?? [],
    fuelType,
    priceHistory: historyForAI.length > 0 ? historyForAI : undefined,
    lat: userLocation?.lat,
    lng: userLocation?.lng,
    fillUpLiters,
  });

  // ---- Merge: prefer AI when available, fall back to local ----

  const aiRec: AIAdvisorResponse | null =
    !aiError && aiResult ? aiResult.recommendation : null;

  const isAIPowered = aiRec !== null;
  const isWaitingForAI = aiLoading && !aiRec;

  // Effective recommendation fields
  const action = aiRec?.action ?? localRecommendation.action;
  const headline = aiRec?.headline ?? localRecommendation.headline;
  const explanation = aiRec?.explanation ?? localRecommendation.explanation;
  const bestTimePrediction = aiRec?.bestTimePrediction ?? localRecommendation.bestTimePrediction;
  const savingsEstimate = aiRec?.savingsEstimate ?? localRecommendation.savingsEstimate;
  const confidence: Confidence = aiRec?.confidence ?? localRecommendation.confidence;

  // AI-only extra fields
  const bestStation = aiRec?.bestStation;
  const priceOutlook = aiRec?.priceOutlook;
  const tip = aiRec?.tip;

  const isBuyNow = action === 'buy_now';
  const confidenceCfg = CONFIDENCE_CONFIG[confidence];

  return (
    <div className={`bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card overflow-hidden ${className}`}>
      {/* Action banner */}
      <div
        className={`px-5 py-4 flex items-center gap-3 ${
          isBuyNow
            ? 'bg-gradient-to-r from-brand-500 to-brand-700'
            : 'bg-gradient-to-r from-amber-400 to-orange-500'
        }`}
      >
        <span className="text-2xl">
          {isBuyNow ? '\u26fd' : '\u23f3'}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-extrabold text-white leading-tight">
            {headline}
          </h3>
          <p className="text-[11px] text-white/80 mt-0.5 leading-snug">
            {FUEL_TYPE_LABELS[fuelType]}
          </p>
        </div>
        <ConfidenceDots confidence={confidence} />
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Explanation */}
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          {explanation}
        </p>

        {/* Best time prediction */}
        <div className="flex items-start gap-2.5 bg-brand-50 dark:bg-brand-900/15 rounded-xl p-3">
          <svg className="w-4 h-4 text-brand-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-brand-700 dark:text-brand-300 leading-relaxed">
            {bestTimePrediction}
          </p>
        </div>

        {/* Savings estimate */}
        {savingsEstimate > 0 && (
          <div className="flex items-start gap-2.5 bg-green-50 dark:bg-green-900/15 rounded-xl p-3">
            <svg className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
            <p className="text-xs text-green-700 dark:text-green-300 leading-relaxed">
              Sie k&ouml;nnten bis zu{' '}
              <span className="font-bold">~{savingsEstimate.toFixed(2)} &euro;</span>
              {' '}sparen bei {fillUpLiters} L
            </p>
          </div>
        )}

        {/* AI-only: Best station recommendation */}
        {isWaitingForAI && (
          <div className="space-y-2">
            <ShimmerLine className="h-10 w-full" />
            <ShimmerLine className="h-10 w-3/4" />
          </div>
        )}

        {bestStation && (
          <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-900/15 rounded-xl p-3">
            <svg className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                {bestStation.name}
              </p>
              <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-snug mt-0.5">
                {bestStation.reason}
              </p>
            </div>
          </div>
        )}

        {/* AI-only: 24h price outlook */}
        {priceOutlook && (
          <div className="flex items-start gap-2.5 bg-purple-50 dark:bg-purple-900/15 rounded-xl p-3">
            <svg className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-purple-500 dark:text-purple-400 uppercase tracking-wider mb-0.5">
                24h Ausblick
              </p>
              <p className="text-xs text-purple-700 dark:text-purple-300 leading-relaxed">
                {priceOutlook}
              </p>
            </div>
          </div>
        )}

        {/* AI-only: Practical fuel-saving tip */}
        {tip && (
          <div className="flex items-start gap-2.5 bg-amber-50 dark:bg-amber-900/15 rounded-xl p-3">
            <svg className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-amber-500 dark:text-amber-400 uppercase tracking-wider mb-0.5">
                Spar-Tipp
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                {tip}
              </p>
            </div>
          </div>
        )}

        {/* Meta info */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            {isWaitingForAI ? (
              <span className="animate-pulse">KI l&auml;dt...</span>
            ) : isAIPowered ? (
              <span>KI-powered by GPT-4o</span>
            ) : (
              <span>KI-basierte Prognose</span>
            )}
          </div>
          <div className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${confidenceCfg.bg}`}>
            <span style={{ color: confidenceCfg.color }}>
              Konfidenz: {confidenceCfg.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
