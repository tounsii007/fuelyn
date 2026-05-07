// ============================================================
// Fuel Log Page — Tank-Logbuch
// ============================================================

'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store/app-store';
import { FUEL_TYPE_LABELS } from '@tankpilot/core';
import type { FuelType } from '@tankpilot/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConsumptionTracker } from '@/components/intelligence/ConsumptionTracker';

export default function FuelLogPage() {
  const fuelLog = useAppStore((s) => s.fuelLog);
  const addFuelLogEntry = useAppStore((s) => s.addFuelLogEntry);
  const removeFuelLogEntry = useAppStore((s) => s.removeFuelLogEntry);

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({
    stationName: '',
    stationBrand: '',
    fuelType: 'e10' as FuelType,
    liters: 30,
    pricePerLiter: 1.65,
    odometer: 0,
    note: '',
  });
  const totalPreview = Number.isFinite(form.liters * form.pricePerLiter)
    ? form.liters * form.pricePerLiter
    : 0;

  const handleAdd = useCallback(() => {
    if (
      !form.stationName.trim() ||
      !Number.isFinite(form.liters) ||
      !Number.isFinite(form.pricePerLiter) ||
      form.liters <= 0 ||
      form.pricePerLiter <= 0
    ) return;
    addFuelLogEntry({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      stationName: form.stationName.trim(),
      stationBrand: form.stationBrand.trim(),
      fuelType: form.fuelType,
      liters: form.liters,
      pricePerLiter: form.pricePerLiter,
      totalCost: Math.round(form.liters * form.pricePerLiter * 100) / 100,
      odometer: form.odometer || undefined,
      note: form.note || undefined,
    });
    setIsAdding(false);
    setForm({ stationName: '', stationBrand: '', fuelType: 'e10', liters: 30, pricePerLiter: 1.65, odometer: 0, note: '' });
  }, [form, addFuelLogEntry]);

  // Stats
  const stats = useMemo(() => {
    if (fuelLog.length === 0) return null;
    const totalCost = fuelLog.reduce((s, e) => s + e.totalCost, 0);
    const totalLiters = fuelLog.reduce((s, e) => s + e.liters, 0);
    const avgPrice = totalCost / totalLiters;
    return { totalCost, totalLiters, avgPrice, count: fuelLog.length };
  }, [fuelLog]);

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade-in">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        Zur&uuml;ck
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Tank-Logbuch</h1>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl
                     hover:bg-brand-700 transition-colors"
        >
          + Eintrag
        </button>
      </div>

      {/* KI Verbrauchstracker */}
      <ConsumptionTracker className="mb-4" />

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-4 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Gesamt</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.totalCost.toFixed(2)} &euro;</p>
          </div>
          <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-4 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">Liter</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.totalLiters.toFixed(1)} L</p>
          </div>
          <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-4 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">&Oslash; Preis</p>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.avgPrice.toFixed(3)} &euro;</p>
          </div>
        </div>
      )}

      {/* Add Form */}
      {isAdding && (
        <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5 mb-4 animate-slide-down">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">Neue Tankf&uuml;llung</h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">Tankstelle</label>
              <input
                type="text"
                value={form.stationName}
                onChange={(e) => setForm({ ...form, stationName: e.target.value })}
                placeholder="z.B. Aral Hauptstra&szlig;e"
                className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                           bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Kraftstoff</label>
              <select
                value={form.fuelType}
                onChange={(e) => setForm({ ...form, fuelType: e.target.value as FuelType })}
                className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                           bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {Object.entries(FUEL_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Liter</label>
              <input
                type="number"
                value={form.liters}
                onChange={(e) => setForm({ ...form, liters: Math.max(0, Number(e.target.value) || 0) })}
                step={0.1}
                className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                           bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Preis (&euro;/L)</label>
              <input
                type="number"
                value={form.pricePerLiter}
                onChange={(e) => setForm({ ...form, pricePerLiter: Math.max(0, Number(e.target.value) || 0) })}
                step={0.001}
                className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                           bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Kilometerstand</label>
              <input
                type="number"
                value={form.odometer || ''}
                onChange={(e) => setForm({ ...form, odometer: Math.max(0, Number(e.target.value) || 0) })}
                placeholder="Optional"
                className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                           bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          {/* Total preview */}
          <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-3 mb-4 text-center">
            <span className="text-xs text-brand-600/70">Gesamtkosten: </span>
            <span className="text-lg font-bold text-brand-700 dark:text-brand-300">
              {totalPreview.toFixed(2)} &euro;
            </span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleAdd}
              className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl hover:bg-brand-700 transition-colors">
              Speichern
            </button>
            <button type="button" onClick={() => setIsAdding(false)}
              className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm rounded-xl
                         hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Log Entries */}
      {fuelLog.length === 0 ? (
        <EmptyState
          title="Noch keine Eintr&auml;ge"
          message="Protokolliere deine Tankf&uuml;llungen, um Kosten und Verbrauch zu tracken."
        />
      ) : (
        <div className="space-y-3">
          {fuelLog.map((entry) => (
            <div key={entry.id} className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{entry.stationName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                    {' \u00b7 '}{FUEL_TYPE_LABELS[entry.fuelType]}
                  </p>
                </div>
                <button type="button" onClick={() => removeFuelLogEntry(entry.id)}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600 dark:text-gray-300">{entry.liters.toFixed(1)} L</span>
                <span className="text-gray-600 dark:text-gray-300">{entry.pricePerLiter.toFixed(3)} &euro;/L</span>
                <span className="ml-auto font-bold text-gray-900 dark:text-gray-100">{entry.totalCost.toFixed(2)} &euro;</span>
              </div>
              {entry.odometer && (
                <p className="text-xs text-gray-400 mt-1">km-Stand: {entry.odometer.toLocaleString('de-DE')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
