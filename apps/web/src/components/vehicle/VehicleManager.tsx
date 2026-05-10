// ============================================================
// VehicleManager — multi-vehicle picker + add/remove (Iter P).
//
// Lives at the top of the /vehicle page. Shows every saved
// vehicle as a selectable chip; the user can add a new one (which
// opens the existing VehicleForm pre-populated with sane defaults)
// or remove a non-active one. The active vehicle drives every
// downstream calculation (range, trip cost, CO₂, …).
// ============================================================

'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import type { VehicleProfile } from '@fuelyn/core';

const FUEL_BADGE_CLASS: Record<string, string> = {
  e10: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  e5: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  diesel: 'bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200',
};

export function VehicleManager() {
  const { t } = useTranslations();
  const vehicles = useAppStore((s) => s.vehicles);
  const activeId = useAppStore((s) => s.activeVehicleId);
  const setActiveVehicleId = useAppStore((s) => s.setActiveVehicleId);
  const removeVehicle = useAppStore((s) => s.removeVehicle);
  const addVehicle = useAppStore((s) => s.addVehicle);
  const setVehicleFormOpen = useAppStore((s) => s.setVehicleFormOpen);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (vehicles.length === 0) return null;

  const handleAdd = () => {
    // Drop a blank profile in and open the form so the user fills it.
    const blank: VehicleProfile = {
      id: `veh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: t('vehicleManager.newVehicleName'),
      fuelType: 'e10',
      driveType: 'benzin',
      consumption: 6,
      tankCapacity: 50,
      batteryCapacity: null,
      currentRange: null,
      currentFuelLevel: null,
      currentFuelUnit: 'liters',
    };
    addVehicle(blank);
    setVehicleFormOpen(true);
  };

  const confirmDelete = (id: string) => {
    if (pendingDeleteId === id) {
      removeVehicle(id);
      setPendingDeleteId(null);
    } else {
      setPendingDeleteId(id);
    }
  };

  return (
    <section
      aria-label={t('vehicleManager.title')}
      className="rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-subtle)]/40 p-4 mb-6"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">
          {t('vehicleManager.title')}
        </h2>
        <button
          type="button"
          onClick={handleAdd}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)]
                     bg-[var(--color-bg)] px-2.5 py-1 text-xs font-medium text-[var(--color-fg)]
                     hover:bg-[var(--color-surface-hover)] transition-colors"
        >
          + {t('vehicleManager.add')}
        </button>
      </div>

      <p className="text-[11px] text-[var(--color-fg-subtle)] mb-3">
        {t('vehicleManager.subtitle')}
      </p>

      <ul className="space-y-2">
        {vehicles.map((v) => {
          const isActive = v.id === activeId;
          const isPendingDelete = pendingDeleteId === v.id;
          const fuelBadge = FUEL_BADGE_CLASS[v.fuelType] ?? FUEL_BADGE_CLASS.e10!;
          return (
            <li
              key={v.id}
              className={`flex items-center justify-between rounded-xl border p-3 transition-colors
                         ${isActive
                           ? 'border-[var(--color-brand-500)] bg-[var(--color-brand-500)]/5'
                           : 'border-[var(--color-border-subtle)] bg-[var(--color-bg)] hover:bg-[var(--color-surface-hover)]'}`}
            >
              <button
                type="button"
                onClick={() => setActiveVehicleId(v.id)}
                className="flex-1 text-left flex items-center gap-3"
                aria-pressed={isActive}
              >
                <span
                  className={`inline-flex h-2.5 w-2.5 rounded-full
                             ${isActive ? 'bg-[var(--color-brand-500)]' : 'bg-[var(--color-border)]'}`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--color-fg)] truncate">
                    {v.name || t('vehicleManager.unnamed')}
                  </span>
                  <span className="block text-[11px] text-[var(--color-fg-subtle)]">
                    {v.consumption.toFixed(1)} L/100 km
                    {v.tankCapacity ? ` · ${v.tankCapacity} L` : ''}
                  </span>
                </span>
                <span
                  className={`ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium
                             ${fuelBadge}`}
                >
                  {v.fuelType.toUpperCase()}
                </span>
              </button>

              <button
                type="button"
                onClick={() => confirmDelete(v.id)}
                disabled={vehicles.length === 1}
                className={`ml-2 inline-flex items-center justify-center h-7 px-2 rounded-md text-xs font-medium
                           ${isPendingDelete
                             ? 'bg-[var(--color-danger-500)] text-white hover:bg-[var(--color-danger-600)]'
                             : 'text-[var(--color-fg-subtle)] hover:text-[var(--color-danger-500)] hover:bg-[var(--color-danger-50)] dark:hover:bg-[var(--color-danger-900)]/20'}
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors`}
                aria-label={isPendingDelete ? t('vehicleManager.confirmDelete') : t('vehicleManager.delete')}
              >
                {isPendingDelete ? t('vehicleManager.confirmDelete') : '✕'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
