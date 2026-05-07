// ============================================================
// Consumption Statistics Page — Verbrauchsstatistik
// ============================================================

'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store/app-store';
import { FUEL_TYPE_LABELS } from '@tankpilot/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { PriceHistoryChart } from '@/components/charts/PriceHistoryChart';
import { ConsumptionTracker } from '@/components/intelligence/ConsumptionTracker';

export default function StatsPage() {
  const fuelLog = useAppStore((s) => s.fuelLog);

  const stats = useMemo(() => {
    if (fuelLog.length === 0) return null;

    const totalCost = fuelLog.reduce((s, e) => s + e.totalCost, 0);
    const totalLiters = fuelLog.reduce((s, e) => s + e.liters, 0);
    const avgPricePerLiter = totalLiters > 0 ? totalCost / totalLiters : 0;

    // Per fuel type breakdown
    const byFuel = new Map<string, { cost: number; liters: number; count: number }>();
    for (const entry of fuelLog) {
      const prev = byFuel.get(entry.fuelType) || { cost: 0, liters: 0, count: 0 };
      byFuel.set(entry.fuelType, {
        cost: prev.cost + entry.totalCost,
        liters: prev.liters + entry.liters,
        count: prev.count + 1,
      });
    }

    // Monthly breakdown (last 6 months)
    const monthly = new Map<string, { cost: number; liters: number }>();
    for (const entry of fuelLog) {
      const d = new Date(entry.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const prev = monthly.get(key) || { cost: 0, liters: 0 };
      monthly.set(key, { cost: prev.cost + entry.totalCost, liters: prev.liters + entry.liters });
    }
    const monthlyArr = [...monthly.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6);

    // Consumption if odometer data available
    const withOdometer = fuelLog
      .filter((entry) => typeof entry.odometer === 'number' && entry.odometer > 0)
      .sort((left, right) => (left.odometer ?? 0) - (right.odometer ?? 0));
    let consumption: number | null = null;
    if (withOdometer.length >= 2) {
      const first = withOdometer[0]!;
      const last = withOdometer[withOdometer.length - 1]!;
      const km = (last.odometer ?? 0) - (first.odometer ?? 0);
      const liters = withOdometer.slice(1).reduce((s, e) => s + e.liters, 0);
      if (km > 0) consumption = (liters / km) * 100;
    }

    return {
      totalCost,
      totalLiters,
      avgPricePerLiter,
      count: fuelLog.length,
      byFuel,
      monthlyArr,
      consumption,
    };
  }, [fuelLog]);

  const maxMonthlyCost = useMemo(() => {
    if (!stats) return 0;
    return Math.max(...stats.monthlyArr.map(([, v]) => v.cost), 1);
  }, [stats]);

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade-in">
      <Link href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Zur&uuml;ck
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Verbrauchsstatistik</h1>

      {/* KI Preisverlauf-Chart */}
      <PriceHistoryChart className="mb-4" />

      {/* Verbrauchstracker Widget */}
      <ConsumptionTracker className="mb-4" />

      {!stats ? (
        <EmptyState
          title="Keine Daten vorhanden"
          message="Trage Tankf&uuml;llungen im Tank-Logbuch ein, um Statistiken zu sehen."
          action={{ label: 'Zum Logbuch', onClick: () => { window.location.href = '/fuel-log'; } }}
        />
      ) : (
        <div className="space-y-4">
          {/* Overview Cards */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Gesamtausgaben" value={`${stats.totalCost.toFixed(2)} \u20ac`} />
            <StatCard label="Getankte Liter" value={`${stats.totalLiters.toFixed(1)} L`} />
            <StatCard label="Ø Preis/Liter" value={`${stats.avgPricePerLiter.toFixed(3)} \u20ac`} />
            <StatCard label="Tankstopps" value={String(stats.count)} />
          </div>

          {/* Consumption */}
          {stats.consumption != null && (
            <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Durchschnittsverbrauch</h2>
              <p className="text-3xl font-bold text-brand-600">{stats.consumption.toFixed(1)} <span className="text-base font-normal text-gray-500">L/100km</span></p>
              <p className="text-xs text-gray-400 mt-1">Berechnet aus Kilometerstand-Daten</p>
            </div>
          )}

          {/* By Fuel Type */}
          <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Nach Kraftstoff</h2>
            <div className="space-y-3">
              {[...stats.byFuel.entries()].map(([ft, data]) => (
                <div key={ft} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{FUEL_TYPE_LABELS[ft as keyof typeof FUEL_TYPE_LABELS] ?? ft}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{data.count} Tankf&uuml;llungen &middot; {data.liters.toFixed(1)} L</p>
                  </div>
                  <span className="text-sm font-bold text-gray-900 dark:text-gray-100">{data.cost.toFixed(2)} &euro;</span>
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Chart */}
          {stats.monthlyArr.length > 1 && (
            <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Monatliche Kosten</h2>
              <div className="flex items-end gap-2 h-32">
                {stats.monthlyArr.map(([month, data]) => {
                  const height = (data.cost / maxMonthlyCost) * 100;
                  const [y, m] = month.split('-');
                  const label = `${m}/${y!.slice(2)}`;
                  return (
                    <div key={month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-gray-500 font-medium">{data.cost.toFixed(0)}&euro;</span>
                      <div className="w-full rounded-t-lg bg-brand-500 transition-all" style={{ height: `${height}%`, minHeight: 4 }} />
                      <span className="text-[10px] text-gray-400">{label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-4 text-center">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900 dark:text-gray-100 mt-1">{value}</p>
    </div>
  );
}
