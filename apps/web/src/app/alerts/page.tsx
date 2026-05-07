// ============================================================
// Price Alerts Page
// ============================================================

'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store/app-store';
import { FUEL_TYPE_LABELS } from '@tankpilot/core';
import type { FuelType, PriceAlert } from '@tankpilot/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { GeoFenceList } from '@/components/alerts/GeoFenceList';

export default function AlertsPage() {
  const alerts = useAppStore((s) => s.priceAlerts);
  const addPriceAlert = useAppStore((s) => s.addPriceAlert);
  const removePriceAlert = useAppStore((s) => s.removePriceAlert);
  const togglePriceAlert = useAppStore((s) => s.togglePriceAlert);

  const [isAdding, setIsAdding] = useState(false);
  const [fuelType, setFuelType] = useState<FuelType>('e10');
  const [targetPrice, setTargetPrice] = useState(1.60);

  const handleAdd = useCallback(() => {
    if (!Number.isFinite(targetPrice) || targetPrice <= 0) return;
    addPriceAlert({
      id: crypto.randomUUID(),
      fuelType,
      targetPrice,
      enabled: true,
      createdAt: new Date().toISOString(),
    });
    setIsAdding(false);
  }, [fuelType, targetPrice, addPriceAlert]);

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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Preisalarme</h1>
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-semibold rounded-xl
                     hover:bg-brand-700 transition-colors"
        >
          + Neuer Alarm
        </button>
      </div>

      {/* Add Alert Form */}
      {isAdding && (
        <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5 mb-4 animate-slide-down">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4">Neuer Preisalarm</h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400">Kraftstoff</label>
              <select
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value as FuelType)}
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
              <label className="text-xs text-gray-500 dark:text-gray-400">Wunschpreis (&euro;/L)</label>
              <input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(Math.max(0, Number(e.target.value) || 0))}
                step={0.01}
                min={0.5}
                max={3.0}
                className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                           bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                           focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-xl
                         hover:bg-brand-700 transition-colors"
            >
              Erstellen
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300
                         text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Alert List */}
      {alerts.length === 0 ? (
        <EmptyState
          title="Keine Preisalarme"
          message="Erstelle einen Alarm und werde benachrichtigt, wenn der Preis unter deinen Wunschpreis f&auml;llt."
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onToggle={() => togglePriceAlert(alert.id)}
              onRemove={() => removePriceAlert(alert.id)}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6 text-center">
        Alarme werden beim n&auml;chsten &Ouml;ffnen der App gepr&uuml;ft.
      </p>

      {/* Geo-fenced alerts */}
      <div className="mt-10">
        <GeoFenceList />
      </div>
    </div>
  );
}

function AlertCard({
  alert,
  onToggle,
  onRemove,
}: {
  alert: PriceAlert;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const fuelColor = alert.fuelType === 'diesel' ? 'bg-fuel-diesel' : alert.fuelType === 'e5' ? 'bg-fuel-e5' : 'bg-fuel-e10';

  return (
    <div className={`bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-4
                     flex items-center gap-4 ${!alert.enabled ? 'opacity-50' : ''}`}>
      <div className={`w-3 h-3 rounded-full ${fuelColor} flex-shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {FUEL_TYPE_LABELS[alert.fuelType]} unter {alert.targetPrice.toFixed(2)} &euro;
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Erstellt am {new Date(alert.createdAt).toLocaleDateString('de-DE')}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
          alert.enabled ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          alert.enabled ? 'translate-x-5' : 'translate-x-0'
        }`} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
      >
        <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
        </svg>
      </button>
    </div>
  );
}
