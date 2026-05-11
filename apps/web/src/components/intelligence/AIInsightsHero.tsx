// ============================================================
// AIInsightsHero — premium glass hero card sitting at the very
// top of the right side-panel.
//
// Rationale: when the user opens Fuelyn, the first 200 ms of eye
// movement decides whether they trust the verdict. Burying the AI
// recommendation 3 cards deep (FuelAdvisor) was a missed shot.
// This hero condenses the "money line" into a single glance:
//
//   ⚡ AI EMPFEHLUNG · live          ●●● Hoch
//   Jetzt tanken
//   Bis zu 3,50 € sparen · Shell Marburg
//
// The detailed FuelAdvisor card lives further down for users who
// want the full breakdown — this is the "elevator pitch" version.
// ============================================================

'use client';

import { useMemo } from 'react';
import type { StationRecommendation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useAIAdvisor } from '@/lib/hooks/use-ai-advisor';
import {
  analyzePrices,
  getMockRecommendation,
} from '@/lib/utils/price-intelligence';
import type { Confidence } from '@/lib/utils/price-intelligence';

export interface AIInsightsHeroProps {
  readonly recommendations: readonly StationRecommendation[];
}

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'Hoch',
  medium: 'Mittel',
  low: 'Niedrig',
};

const CONFIDENCE_DOTS: Record<Confidence, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export function AIInsightsHero({ recommendations }: AIInsightsHeroProps) {
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const priceHistory = useAppStore((s) => s.priceHistory);
  const userLocation = useAppStore((s) => s.userLocation);

  // ─── Local heuristic baseline ───────────────────────────────
  const local = useMemo(() => {
    const fuelData = priceHistory
      .filter((p) => p.fuelType === fuelType && Number.isFinite(p.price))
      .map((p) => ({ price: p.price, timestamp: p.timestamp }));
    return fuelData.length >= 4
      ? analyzePrices(fuelData, fuelType, 50)
      : getMockRecommendation(fuelType, 50);
  }, [priceHistory, fuelType]);

  // ─── AI advisor (async, optional enhancement) ───────────────
  const stationPrices = useMemo(
    () =>
      recommendations.slice(0, 10).map((r) => ({
        stationName: r.station.name,
        brand: r.station.brand,
        price: r.station.prices?.[fuelType] ?? 0,
        distance: r.station.dist ?? 0,
      })),
    [recommendations, fuelType],
  );

  const historyForAI = useMemo(
    () =>
      priceHistory
        .filter((p) => p.fuelType === fuelType && Number.isFinite(p.price))
        .map((p) => ({ price: p.price, timestamp: p.timestamp })),
    [priceHistory, fuelType],
  );

  const { data: aiResult, isLoading: aiLoading } = useAIAdvisor({
    prices: stationPrices,
    fuelType,
    priceHistory: historyForAI.length > 0 ? historyForAI : undefined,
    lat: userLocation?.lat,
    lng: userLocation?.lng,
    fillUpLiters: 50,
  });

  const aiRec = aiResult?.recommendation ?? null;

  // ─── Effective verdict ──────────────────────────────────────
  const action = aiRec?.action ?? local.action;
  const headline = aiRec?.headline ?? local.headline;
  const savingsEstimate = aiRec?.savingsEstimate ?? local.savingsEstimate;
  const confidence: Confidence = aiRec?.confidence ?? local.confidence;
  const bestStation = aiRec?.bestStation;
  const isBuyNow = action === 'buy_now';
  const isAIPowered = aiRec !== null;

  // ─── Best station name fallback ─────────────────────────────
  const heroBestStation = useMemo(() => {
    if (bestStation?.name) return bestStation.name;
    const cheapest = recommendations
      .filter((r) => r.station.isOpen && r.station.prices?.[fuelType])
      .sort(
        (a, b) =>
          (a.station.prices?.[fuelType] ?? Infinity) -
          (b.station.prices?.[fuelType] ?? Infinity),
      )[0];
    return cheapest?.station.brand || cheapest?.station.name || null;
  }, [bestStation, recommendations, fuelType]);

  if (recommendations.length === 0) return null;

  const dotsActive = CONFIDENCE_DOTS[confidence];

  // ─── Render ─────────────────────────────────────────────────
  // Action-aware gradient: emerald-cyan tilt when "buy now" (positive
  // momentum), amber-rose when "wait" (hold off). Both sit on a deep
  // navy base so the panel reads as one cohesive surface.
  const verdictGradient = isBuyNow
    ? 'from-emerald-500/30 via-cyan-500/20 to-blue-500/15'
    : 'from-amber-500/30 via-orange-500/20 to-rose-500/15';

  return (
    <section
      aria-label="AI Tank-Empfehlung"
      className="mx-3 mt-3 mb-3 relative overflow-hidden rounded-2xl
                 border border-white/10 dark:border-white/15
                 bg-gradient-to-br from-[oklch(0.16_0.05_265)]
                                  via-[oklch(0.14_0.07_270)]
                                  to-[oklch(0.12_0.08_280)]
                 backdrop-blur-md
                 shadow-[0_8px_30px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]
                 fy-enter"
    >
      {/* Animated halo — colour is action-dependent */}
      <div
        aria-hidden="true"
        className={[
          'pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-70 blur-3xl',
          'bg-gradient-to-br',
          verdictGradient,
        ].join(' ')}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -left-20 w-64 h-64 rounded-full opacity-30 blur-3xl
                   bg-[radial-gradient(circle,_oklch(0.62_0.24_295/0.45)_0%,_transparent_70%)]"
      />

      <div className="relative p-3.5">
        {/* Eyebrow row — AI EMPFEHLUNG · live · confidence dots */}
        <header className="flex items-center justify-between mb-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase
                           tracking-[0.18em] text-cyan-300">
            <SparkleIcon />
            AI Empfehlung
            {aiLoading && <DotsLoader />}
          </span>
          <span
            aria-label={`Konfidenz: ${CONFIDENCE_LABEL[confidence]}`}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-white/60"
          >
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={[
                  'w-1 h-1 rounded-full transition-colors',
                  n <= dotsActive
                    ? confidence === 'high'
                      ? 'bg-emerald-400'
                      : confidence === 'medium'
                        ? 'bg-amber-400'
                        : 'bg-slate-400'
                    : 'bg-white/15',
                ].join(' ')}
              />
            ))}
            <span className="ml-1 uppercase tracking-wider text-[9px]">
              {CONFIDENCE_LABEL[confidence]}
            </span>
          </span>
        </header>

        {/* Big headline verdict */}
        <h2
          className={[
            'text-[22px] font-extrabold tracking-tight leading-tight',
            'bg-gradient-to-r bg-clip-text text-transparent',
            isBuyNow
              ? 'from-emerald-200 via-cyan-200 to-white'
              : 'from-amber-200 via-orange-200 to-white',
          ].join(' ')}
        >
          {headline}
        </h2>

        {/* Money line + best station */}
        <div className="mt-1.5 flex items-baseline gap-2 text-[12px] text-white/80">
          {savingsEstimate > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="font-semibold tabular-nums text-white">
                Bis zu {savingsEstimate.toFixed(2).replace('.', ',')} €
              </span>
              <span className="text-white/55">sparen</span>
            </span>
          )}
          {heroBestStation && (
            <>
              {savingsEstimate > 0 && <span className="text-white/30">·</span>}
              <span className="truncate text-white/70">{heroBestStation}</span>
            </>
          )}
        </div>

        {/* Footer micro — live indicator + power source */}
        <footer className="mt-2.5 flex items-center justify-between text-[9px] uppercase tracking-wider">
          <span className="inline-flex items-center gap-1 text-white/40">
            <span className="relative inline-flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </span>
            Live
          </span>
          <span className="text-white/35">
            {isAIPowered ? 'GPT-4o · Kafka-stream' : 'Heuristik · 8 Signale'}
          </span>
        </footer>
      </div>
    </section>
  );
}

// ─── Tiny inline glyphs ─────────────────────────────────────

function SparkleIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.6 4.4L18 8l-4.4 1.6L12 14l-1.6-4.4L6 8l4.4-1.6L12 2zm6 12l.9 2.4L21 17l-2.1.6L18 20l-.9-2.4L15 17l2.1-.6.9-2.4z" />
    </svg>
  );
}

function DotsLoader() {
  return (
    <span className="inline-flex items-center gap-0.5 ml-1" aria-label="lädt">
      <span className="w-1 h-1 rounded-full bg-cyan-300/70 animate-pulse [animation-delay:0ms]" />
      <span className="w-1 h-1 rounded-full bg-cyan-300/70 animate-pulse [animation-delay:120ms]" />
      <span className="w-1 h-1 rounded-full bg-cyan-300/70 animate-pulse [animation-delay:240ms]" />
    </span>
  );
}
