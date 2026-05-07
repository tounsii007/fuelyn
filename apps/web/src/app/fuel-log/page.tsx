// ============================================================
// Fuel Log Page — Tank-Logbuch
// ============================================================

'use client';

import { useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { FUEL_TYPE_LABELS } from '@tankpilot/core';
import type { FuelType } from '@tankpilot/core';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConsumptionTracker } from '@/components/intelligence/ConsumptionTracker';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { IconButton } from '@/components/ui/IconButton';
import { StatCard } from '@/components/ui/StatCard';

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
    )
      return;
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
    setForm({
      stationName: '',
      stationBrand: '',
      fuelType: 'e10',
      liters: 30,
      pricePerLiter: 1.65,
      odometer: 0,
      note: '',
    });
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
      <PageHeader
        title="Tank-Logbuch"
        action={
          !isAdding && (
            <Button onClick={() => setIsAdding(true)} size="sm" leadingIcon={<PlusIcon />}>
              Eintrag
            </Button>
          )
        }
      />

      {/* KI Verbrauchstracker */}
      <ConsumptionTracker className="mb-4" />

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard label="Gesamt" value={stats.totalCost.toFixed(2)} unit="€" />
          <StatCard label="Liter" value={stats.totalLiters.toFixed(1)} unit="L" />
          <StatCard
            label="Ø Preis"
            value={stats.avgPrice.toFixed(3)}
            unit="€"
            tone="brand"
          />
        </div>
      )}

      {/* Add Form */}
      {isAdding && (
        <section
          aria-labelledby="new-entry-heading"
          className="bg-white dark:bg-gray-800/90 rounded-2xl shadow-card
                     border border-gray-100 dark:border-gray-700/60
                     p-5 mb-4 animate-slide-down"
        >
          <h3
            id="new-entry-heading"
            className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4"
          >
            Neue Tankfüllung
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="col-span-2">
              <Input
                label="Tankstelle"
                type="text"
                value={form.stationName}
                onChange={(e) => setForm({ ...form, stationName: e.target.value })}
                placeholder="z. B. Aral Hauptstraße"
              />
            </div>
            <Select
              label="Kraftstoff"
              value={form.fuelType}
              onChange={(e) => setForm({ ...form, fuelType: e.target.value as FuelType })}
            >
              {Object.entries(FUEL_TYPE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Input
              label="Liter"
              type="number"
              value={form.liters}
              onChange={(e) =>
                setForm({ ...form, liters: Math.max(0, Number(e.target.value) || 0) })
              }
              step={0.1}
            />
            <Input
              label="Preis (€/L)"
              type="number"
              value={form.pricePerLiter}
              onChange={(e) =>
                setForm({ ...form, pricePerLiter: Math.max(0, Number(e.target.value) || 0) })
              }
              step={0.001}
            />
            <Input
              label="Kilometerstand"
              type="number"
              value={form.odometer || ''}
              onChange={(e) =>
                setForm({ ...form, odometer: Math.max(0, Number(e.target.value) || 0) })
              }
              placeholder="Optional"
            />
          </div>
          {/* Total preview */}
          <div className="bg-brand-50 dark:bg-brand-900/30 rounded-xl p-3 mb-4 text-center">
            <span className="text-xs font-medium text-brand-700/80 dark:text-brand-300/80">
              Gesamtkosten:
            </span>{' '}
            <span className="text-lg font-bold text-brand-700 dark:text-brand-200">
              {totalPreview.toFixed(2)} €
            </span>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleAdd} fullWidth>
              Speichern
            </Button>
            <Button variant="secondary" onClick={() => setIsAdding(false)}>
              Abbrechen
            </Button>
          </div>
        </section>
      )}

      {/* Log Entries */}
      {fuelLog.length === 0 ? (
        <EmptyState
          title="Noch keine Einträge"
          message="Protokolliere deine Tankfüllungen, um Kosten und Verbrauch zu tracken."
        />
      ) : (
        <ul className="space-y-3">
          {fuelLog.map((entry) => (
            <li
              key={entry.id}
              className="bg-white dark:bg-gray-800/90 rounded-2xl shadow-card
                         border border-gray-100 dark:border-gray-700/60
                         p-4 transition-shadow hover:shadow-card-hover"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                    {entry.stationName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(entry.date).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                    })}
                    {' · '}
                    {FUEL_TYPE_LABELS[entry.fuelType]}
                  </p>
                </div>
                <IconButton
                  size="sm"
                  onClick={() => removeFuelLogEntry(entry.id)}
                  aria-label="Eintrag löschen"
                >
                  <svg
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </IconButton>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-gray-600 dark:text-gray-300 tabular-nums">
                  {entry.liters.toFixed(1)} L
                </span>
                <span className="text-gray-600 dark:text-gray-300 tabular-nums">
                  {entry.pricePerLiter.toFixed(3)} €/L
                </span>
                <span className="ml-auto font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {entry.totalCost.toFixed(2)} €
                </span>
              </div>
              {entry.odometer && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  km-Stand: {entry.odometer.toLocaleString('de-DE')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PlusIcon() {
  return (
    <svg
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}
