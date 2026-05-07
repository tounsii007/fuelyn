// ============================================================
// ConsumptionTracker -- Log fill-ups and track consumption
// Reads/writes to the fuelLog slice in the Zustand store.
// Shows a simple form, consumption stats, and history list.
// ============================================================

'use client';

import { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { FUEL_TYPE_LABELS } from '@tankpilot/core';
import type { FuelType } from '@tankpilot/core';

interface ConsumptionTrackerProps {
  className?: string;
}

export function ConsumptionTracker({ className = '' }: ConsumptionTrackerProps) {
  const fuelLog = useAppStore((s) => s.fuelLog);
  const addFuelLogEntry = useAppStore((s) => s.addFuelLogEntry);
  const removeFuelLogEntry = useAppStore((s) => s.removeFuelLogEntry);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    stationName: '',
    fuelType: 'e10' as FuelType,
    liters: '',
    pricePerLiter: '',
    odometer: '',
  });

  // ---- Consumption calculation ----
  const consumption = useMemo(() => {
    const withOdo = fuelLog
      .filter((e) => typeof e.odometer === 'number' && e.odometer > 0)
      .sort((a, b) => (a.odometer ?? 0) - (b.odometer ?? 0));

    if (withOdo.length < 2) return null;

    const first = withOdo[0]!;
    const last = withOdo[withOdo.length - 1]!;
    const km = (last.odometer ?? 0) - (first.odometer ?? 0);
    const liters = withOdo.slice(1).reduce((s, e) => s + e.liters, 0);

    if (km <= 0) return null;
    return {
      lPer100: (liters / km) * 100,
      totalKm: km,
      totalLiters: liters,
      fillUps: withOdo.length,
    };
  }, [fuelLog]);

  // ---- Stats summary ----
  const stats = useMemo(() => {
    if (fuelLog.length === 0) return null;
    const totalCost = fuelLog.reduce((s, e) => s + e.totalCost, 0);
    const totalLiters = fuelLog.reduce((s, e) => s + e.liters, 0);
    const avgPrice = totalLiters > 0 ? totalCost / totalLiters : 0;
    return { totalCost, totalLiters, avgPrice, count: fuelLog.length };
  }, [fuelLog]);

  const handleSubmit = useCallback(() => {
    const liters = parseFloat(form.liters);
    const price = parseFloat(form.pricePerLiter);
    const odo = form.odometer ? parseInt(form.odometer, 10) : undefined;

    if (!form.stationName.trim() || !Number.isFinite(liters) || !Number.isFinite(price) || liters <= 0 || price <= 0) {
      return;
    }

    addFuelLogEntry({
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      stationName: form.stationName.trim(),
      stationBrand: '',
      fuelType: form.fuelType,
      liters,
      pricePerLiter: price,
      totalCost: Math.round(liters * price * 100) / 100,
      odometer: odo && Number.isFinite(odo) && odo > 0 ? odo : undefined,
    });

    setForm({ stationName: '', fuelType: 'e10', liters: '', pricePerLiter: '', odometer: '' });
    setShowForm(false);
  }, [form, addFuelLogEntry]);

  const inputClass = `w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
    bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
    focus:outline-none focus:ring-2 focus:ring-brand-500 transition-shadow`;

  return (
    <div className={`bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Verbrauchstracker
          </h3>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            Tankf&uuml;llungen protokollieren &amp; Verbrauch berechnen
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="px-3 py-1.5 text-xs font-semibold rounded-xl
                     bg-brand-600 text-white hover:bg-brand-700 active:scale-95
                     transition-all"
        >
          {showForm ? 'Abbrechen' : '+ Eintrag'}
        </button>
      </div>

      {/* Consumption card */}
      {consumption && (
        <div className="mx-4 mb-3 bg-brand-50 dark:bg-brand-900/15 rounded-xl p-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-extrabold text-brand-600 dark:text-brand-400">
              {consumption.lPer100.toFixed(1)}
            </span>
            <span className="text-xs text-brand-500 dark:text-brand-400 font-medium">
              L/100 km
            </span>
          </div>
          <p className="text-[10px] text-brand-600/60 dark:text-brand-400/60 mt-0.5">
            Berechnet aus {consumption.fillUps} Eintr&auml;gen &middot; {consumption.totalKm.toLocaleString('de-DE')} km
          </p>
        </div>
      )}

      {/* Quick stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 mx-4 mb-3">
          <MiniStat label="Ausgaben" value={`${stats.totalCost.toFixed(0)} \u20ac`} />
          <MiniStat label="Liter" value={`${stats.totalLiters.toFixed(0)} L`} />
          <MiniStat label={'\u00d8 Preis'} value={`${stats.avgPrice.toFixed(3)} \u20ac`} />
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="mx-4 mb-3 border border-gray-100 dark:border-gray-700 rounded-xl p-3 animate-slide-down">
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div className="col-span-2">
              <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5 block">
                Tankstelle
              </label>
              <input
                type="text"
                value={form.stationName}
                onChange={(e) => setForm({ ...form, stationName: e.target.value })}
                placeholder="z.B. Aral Hauptstr."
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5 block">
                Kraftstoff
              </label>
              <select
                value={form.fuelType}
                onChange={(e) => setForm({ ...form, fuelType: e.target.value as FuelType })}
                className={inputClass}
              >
                {Object.entries(FUEL_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5 block">
                Liter
              </label>
              <input
                type="number"
                value={form.liters}
                onChange={(e) => setForm({ ...form, liters: e.target.value })}
                placeholder="45.0"
                step="0.1"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5 block">
                Preis (&euro;/L)
              </label>
              <input
                type="number"
                value={form.pricePerLiter}
                onChange={(e) => setForm({ ...form, pricePerLiter: e.target.value })}
                placeholder="1.659"
                step="0.001"
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-0.5 block">
                km-Stand <span className="text-gray-300">(optional)</span>
              </label>
              <input
                type="number"
                value={form.odometer}
                onChange={(e) => setForm({ ...form, odometer: e.target.value })}
                placeholder="52340"
                className={inputClass}
              />
            </div>
          </div>

          {/* Total preview */}
          {form.liters && form.pricePerLiter && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 mb-3 text-center">
              <span className="text-[10px] text-gray-400">Gesamt: </span>
              <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {(parseFloat(form.liters) * parseFloat(form.pricePerLiter) || 0).toFixed(2)} &euro;
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl
                       hover:bg-brand-700 active:scale-[0.98] transition-all"
          >
            Speichern
          </button>
        </div>
      )}

      {/* History list (last 5) */}
      {fuelLog.length > 0 && (
        <div className="border-t border-gray-50 dark:border-gray-700/50">
          <div className="px-4 py-2">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Letzte Eintr&auml;ge
            </p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {fuelLog.slice(0, 5).map((entry) => (
              <div key={entry.id} className="px-4 py-2.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">
                    {entry.stationName}
                  </p>
                  <p className="text-[10px] text-gray-400">
                    {new Date(entry.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}
                    {' \u00b7 '}{entry.liters.toFixed(1)} L
                    {' \u00b7 '}{entry.pricePerLiter.toFixed(3)} &euro;/L
                    {entry.odometer ? ` \u00b7 ${entry.odometer.toLocaleString('de-DE')} km` : ''}
                  </p>
                </div>
                <span className="text-xs font-bold text-gray-900 dark:text-gray-100 flex-shrink-0">
                  {entry.totalCost.toFixed(2)} &euro;
                </span>
                <button
                  type="button"
                  onClick={() => removeFuelLogEntry(entry.id)}
                  className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
                  aria-label="Eintrag entfernen"
                >
                  <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          {fuelLog.length > 5 && (
            <div className="px-4 py-2 text-center">
              <a
                href="/fuel-log"
                className="text-[10px] font-medium text-brand-600 dark:text-brand-400 hover:underline"
              >
                Alle {fuelLog.length} Eintr&auml;ge anzeigen
              </a>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {fuelLog.length === 0 && !showForm && (
        <div className="px-4 pb-4 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
            Noch keine Tankf&uuml;llungen erfasst.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
          >
            Erste Tankf&uuml;llung eintragen
          </button>
        </div>
      )}
    </div>
  );
}

// ---- Helper Components ----

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2 text-center">
      <p className="text-[10px] text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-xs font-bold text-gray-900 dark:text-gray-100 mt-0.5">{value}</p>
    </div>
  );
}
