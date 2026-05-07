// ============================================================
// SavingsCalculator -- Compare current station vs. cheapest
// in radius, factoring in driving cost to reach the cheaper
// station. Shows net savings estimate.
// ============================================================

'use client';

import { useMemo, useState } from 'react';
import type { StationRecommendation, FuelType } from '@fuelyn/core';
import { formatPrice, formatDistance, FUEL_TYPE_LABELS } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';

interface SavingsCalculatorProps {
  /** Station recommendations from the main search. */
  recommendations: StationRecommendation[];
  className?: string;
}

// Default consumption for fuel-cost-of-driving calculation
const DEFAULT_CONSUMPTION_L100 = 7.5;
// Default fill-up volume
const DEFAULT_FILL_LITERS = 45;

interface SavingsResult {
  /** The current/selected station recommendation. */
  currentStation: StationRecommendation;
  /** The cheapest station recommendation. */
  cheapestStation: StationRecommendation;
  /** Price difference per liter. */
  priceDiffPerLiter: number;
  /** Gross savings on the fill-up (before driving cost). */
  grossSavings: number;
  /** Extra distance in km to reach cheaper station. */
  extraDistanceKm: number;
  /** Estimated fuel cost for the extra drive (round trip). */
  drivingCost: number;
  /** Net savings = gross - driving cost. */
  netSavings: number;
  /** Whether driving to the cheaper station is worth it. */
  worthIt: boolean;
}

function calculateSavings(
  current: StationRecommendation,
  cheapest: StationRecommendation,
  fuelType: FuelType,
  fillLiters: number,
  consumptionL100: number,
): SavingsResult | null {
  const currentPrice = current.station.prices?.[fuelType];
  const cheapestPrice = cheapest.station.prices?.[fuelType];

  if (currentPrice == null || cheapestPrice == null) return null;
  if (current.station.id === cheapest.station.id) return null;

  const priceDiffPerLiter = currentPrice - cheapestPrice;
  if (priceDiffPerLiter <= 0) return null;

  const grossSavings = priceDiffPerLiter * fillLiters;

  // Extra distance: difference in distance from user to each station (round trip)
  const extraDistanceKm = Math.max(0, cheapest.station.dist - current.station.dist) * 2;

  // Cost of driving the extra distance
  const drivingFuelLiters = (extraDistanceKm / 100) * consumptionL100;
  const drivingCost = drivingFuelLiters * cheapestPrice;

  const netSavings = grossSavings - drivingCost;
  const worthIt = netSavings > 0.10; // at least 10 cents to be "worth it"

  return {
    currentStation: current,
    cheapestStation: cheapest,
    priceDiffPerLiter,
    grossSavings: Math.round(grossSavings * 100) / 100,
    extraDistanceKm: Math.round(extraDistanceKm * 10) / 10,
    drivingCost: Math.round(drivingCost * 100) / 100,
    netSavings: Math.round(netSavings * 100) / 100,
    worthIt,
  };
}

export function SavingsCalculator({
  recommendations,
  className = '',
}: SavingsCalculatorProps) {
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const vehicle = useAppStore((s) => s.vehicle);
  const selectedStationId = useAppStore((s) => s.selectedStationId);

  const [fillLiters, setFillLiters] = useState(DEFAULT_FILL_LITERS);

  const consumptionL100 = vehicle?.consumption ?? DEFAULT_CONSUMPTION_L100;

  // Find cheapest station
  const cheapest = useMemo(() => {
    let best: StationRecommendation | null = null;
    for (const rec of recommendations) {
      const p = rec.station.prices?.[fuelType];
      if (p == null || !rec.station.isOpen) continue;
      if (!best || p < (best.station.prices?.[fuelType] ?? Infinity)) {
        best = rec;
      }
    }
    return best;
  }, [recommendations, fuelType]);

  // Find "current" station: either selected or nearest
  const currentStation = useMemo(() => {
    if (selectedStationId) {
      return recommendations.find((r) => r.station.id === selectedStationId) ?? null;
    }
    // Use the nearest open station with a price as the "current"
    return recommendations.find(
      (r) => r.station.isOpen && r.station.prices?.[fuelType] != null,
    ) ?? null;
  }, [recommendations, selectedStationId, fuelType]);

  const savings = useMemo(() => {
    if (!currentStation || !cheapest) return null;
    return calculateSavings(currentStation, cheapest, fuelType, fillLiters, consumptionL100);
  }, [currentStation, cheapest, fuelType, fillLiters, consumptionL100]);

  if (!savings || recommendations.length < 2) {
    return null;
  }

  const currentPrice = savings.currentStation.station.prices?.[fuelType];
  const cheapestPrice = savings.cheapestStation.station.prices?.[fuelType];

  return (
    <div className={`bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
          Spar-Rechner
        </h3>
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
          Lohnt sich der Umweg zur g&uuml;nstigsten Tankstelle?
        </p>
      </div>

      {/* Comparison */}
      <div className="mx-4 mb-3 grid grid-cols-2 gap-2">
        {/* Current station */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3">
          <p className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">
            Aktuelle
          </p>
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
            {savings.currentStation.station.brand || savings.currentStation.station.name}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {formatDistance(savings.currentStation.station.dist)}
          </p>
          <p className="text-lg font-extrabold text-gray-900 dark:text-gray-100 mt-1">
            {currentPrice != null ? formatPrice(currentPrice) : 'n/a'} <span className="text-xs font-normal text-gray-400">&euro;</span>
          </p>
        </div>

        {/* Cheapest station */}
        <div className="bg-green-50 dark:bg-green-900/15 rounded-xl p-3 ring-1 ring-green-200 dark:ring-green-800/50">
          <p className="text-[10px] text-green-600 dark:text-green-400 uppercase tracking-wider mb-1 font-medium">
            G&uuml;nstigste
          </p>
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
            {savings.cheapestStation.station.brand || savings.cheapestStation.station.name}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            {formatDistance(savings.cheapestStation.station.dist)}
          </p>
          <p className="text-lg font-extrabold text-green-700 dark:text-green-400 mt-1">
            {cheapestPrice != null ? formatPrice(cheapestPrice) : 'n/a'} <span className="text-xs font-normal text-green-500">&euro;</span>
          </p>
        </div>
      </div>

      {/* Fill-up volume slider */}
      <div className="mx-4 mb-3">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
            Tankmenge
          </label>
          <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
            {fillLiters} L
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={80}
          step={5}
          value={fillLiters}
          onChange={(e) => setFillLiters(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                     bg-gray-200 dark:bg-gray-700
                     [&::-webkit-slider-thumb]:appearance-none
                     [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                     [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-600
                     [&::-webkit-slider-thumb]:shadow-md
                     [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4
                     [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-brand-600
                     [&::-moz-range-thumb]:border-0"
        />
        <div className="flex justify-between text-[9px] text-gray-300 dark:text-gray-600 mt-0.5">
          <span>10 L</span>
          <span>80 L</span>
        </div>
      </div>

      {/* Results */}
      <div className="mx-4 mb-4 space-y-1.5">
        <ResultRow
          label={`Preisdifferenz (${FUEL_TYPE_LABELS[fuelType]})`}
          value={`${savings.priceDiffPerLiter.toFixed(3)} \u20ac/L`}
          color="text-gray-700 dark:text-gray-300"
        />
        <ResultRow
          label={`Ersparnis bei ${fillLiters} L`}
          value={`${savings.grossSavings.toFixed(2)} \u20ac`}
          color="text-green-600 dark:text-green-400"
        />
        {savings.extraDistanceKm > 0 && (
          <ResultRow
            label={`Umweg (${savings.extraDistanceKm.toFixed(1)} km hin+zur\u00fcck)`}
            value={`-${savings.drivingCost.toFixed(2)} \u20ac`}
            color="text-red-500"
          />
        )}
        <div className="border-t border-gray-100 dark:border-gray-700 pt-1.5">
          <ResultRow
            label="Netto-Ersparnis"
            value={`${savings.netSavings >= 0 ? '+' : ''}${savings.netSavings.toFixed(2)} \u20ac`}
            color={savings.worthIt ? 'text-green-700 dark:text-green-400' : 'text-red-500'}
            bold
          />
        </div>
      </div>

      {/* Verdict */}
      <div
        className={`px-4 py-3 text-center text-sm font-semibold ${
          savings.worthIt
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
            : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
        }`}
      >
        {savings.worthIt
          ? `${savings.extraDistanceKm > 0 ? `${savings.extraDistanceKm.toFixed(1)} km weiter fahren spart ${savings.netSavings.toFixed(2)} \u20ac` : `Direkt ${savings.netSavings.toFixed(2)} \u20ac sparen`}`
          : 'Der Umweg lohnt sich nicht \u2014 hier tanken ist besser!'}
      </div>
    </div>
  );
}

// ---- Helper Components ----

function ResultRow({
  label,
  value,
  color,
  bold = false,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`text-xs ${bold ? 'font-extrabold' : 'font-bold'} ${color}`}>
        {value}
      </span>
    </div>
  );
}
