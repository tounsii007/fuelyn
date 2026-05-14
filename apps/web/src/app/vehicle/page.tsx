// ============================================================
// Vehicle Page
// ============================================================

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAppStore } from '@/lib/store/app-store';
import { VehicleForm } from '@/components/vehicle/VehicleForm';
import { VehicleManager } from '@/components/vehicle/VehicleManager';
import { ChargingPlannerCard } from '@/components/charging/ChargingPlannerCard';
import { FUEL_TYPE_LABELS, DRIVE_TYPE_LABELS, formatConsumption, formatRange } from '@fuelyn/core';
import { computeRemainingRange } from '@fuelyn/core';
import { useTranslations } from '@/lib/hooks/use-translations';

export default function VehiclePage() {
  const { t } = useTranslations();
  const vehicle = useAppStore((s) => s.vehicle);
  const setVehicleFormOpen = useAppStore((s) => s.setVehicleFormOpen);
  const isFormOpen = useAppStore((s) => s.isVehicleFormOpen);

  const range = vehicle ? computeRemainingRange(vehicle) : null;

  return (
    <div className="max-w-2xl mx-auto p-6 animate-fade-in">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {t('common.back')}
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
        {t('vehicle.pageTitle')}
      </h1>

      {/*
        Multi-vehicle picker (Iter P). Renders nothing when the user
        only has zero or one vehicle stored, so the existing single-
        vehicle UX stays unchanged for the typical case. For families
        / fleets this becomes a switchable list above the detail form.
      */}
      <VehicleManager />

      {isFormOpen || !vehicle ? (
        <VehicleForm onClose={() => setVehicleFormOpen(false)} />
      ) : (
        <div>
          {/* Vehicle Info Card */}
          <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5 mb-4">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {vehicle.name}
              </h2>
              <button
                type="button"
                onClick={() => setVehicleFormOpen(true)}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                {t('common.edit')}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('vehicle.driveTypeLabel')}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {DRIVE_TYPE_LABELS[vehicle.driveType ?? 'benzin']}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {vehicle.driveType === 'elektro' || vehicle.driveType === 'h2'
                    ? t('vehicle.energyType')
                    : t('vehicle.fuelTypeShort')}
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {vehicle.driveType === 'elektro' ? t('vehicle.electricity')
                    : vehicle.driveType === 'h2' ? t('vehicle.hydrogen')
                    : vehicle.driveType === 'gas' ? (vehicle.preferredGasType?.toUpperCase() ?? 'LPG')
                    : FUEL_TYPE_LABELS[vehicle.fuelType]}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('vehicle.consumptionShort')}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {vehicle.driveType === 'elektro'
                    ? `${vehicle.consumption} ${t('vehicle.consumptionUnitElectric')}`
                    : vehicle.driveType === 'h2'
                      ? `${vehicle.consumption} ${t('vehicle.consumptionUnitH2')}`
                      : formatConsumption(vehicle.consumption)}
                </p>
              </div>
              {vehicle.tankCapacity != null && vehicle.tankCapacity > 0 && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('vehicle.tankCapacity')}</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {vehicle.tankCapacity} L
                  </p>
                </div>
              )}
              {vehicle.batteryCapacity != null && vehicle.batteryCapacity > 0 && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('vehicle.batteryCapacity')}</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {vehicle.batteryCapacity} kWh
                  </p>
                </div>
              )}
              {range != null && (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('vehicle.range')}</p>
                  <p className="text-sm font-medium text-reach-safe">
                    ~{formatRange(range)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Fuel Cost Calculator */}
          {vehicle && <FuelCostCalculator consumption={vehicle.consumption} />}

          {/* EV Charging Planner — only show when the active vehicle
              looks like it can plug in (battery capacity > 0 OR drive
              type is hybrid/electric). Doesn't make sense for pure
              ICE so we hide it there. */}
          {vehicle && (vehicle.driveType === 'elektro' || vehicle.driveType === 'hybrid' || (vehicle.batteryCapacity ?? 0) > 0) && (
            <div className="mt-4">
              <ChargingPlannerCard />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FuelCostCalculator({ consumption }: { consumption: number }) {
  const { t } = useTranslations();
  const [distance, setDistance] = useState(100);
  const [price, setPrice] = useState(1.65);

  const liters = (distance / 100) * consumption;
  const cost = liters * price;

  return (
    <div className="bg-white dark:bg-surface-dark-secondary rounded-2xl shadow-card p-5 mt-4">
      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
        <svg className="w-4 h-4 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25v-.008zm2.25-4.5h.008v.008H10.5v-.008zm0 2.25h.008v.008H10.5v-.008zm0 2.25h.008v.008H10.5v-.008zm2.25-6.75h.008v.008H12.75v-.008zm0 2.25h.008v.008H12.75v-.008zm0 2.25h.008v.008H12.75v-.008zm0 2.25h.008v.008H12.75v-.008zm2.25-6.75h.008v.008H15v-.008zm0 2.25h.008v.008H15v-.008zm0 2.25h.008v.008H15v-.008zm0 2.25h.008v.008H15v-.008z" />
        </svg>
        {t('fuelCostCalc.title')}
      </h3>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">{t('fuelCostCalc.distance')} ({t('fuelCostCalc.distanceUnit')})</label>
          <input
            type="number"
            value={distance}
            onChange={(e) => setDistance(Math.max(0, Number(e.target.value)))}
            className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                       bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400">{t('fuelCostCalc.price')} ({t('fuelCostCalc.priceUnit')})</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
            step={0.01}
            className="mt-1 w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                       bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Quick Distance Buttons */}
      <div className="flex gap-2 mb-4">
        {[50, 100, 250, 500, 1000].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDistance(d)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors
              ${distance === d
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
          >
            {d} km
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="bg-brand-50 dark:bg-brand-900/20 rounded-xl p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-brand-600/70 dark:text-brand-400/70">{t('fuelCostCalc.consumption')}</p>
            <p className="text-lg font-bold text-brand-700 dark:text-brand-300">
              {liters.toFixed(1)} L
            </p>
          </div>
          <div>
            <p className="text-xs text-brand-600/70 dark:text-brand-400/70">{t('fuelCostCalc.cost')}</p>
            <p className="text-lg font-bold text-brand-700 dark:text-brand-300">
              {cost.toFixed(2)} &euro;
            </p>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-brand-100 dark:border-brand-800/30">
          <p className="text-xs text-brand-600/60 dark:text-brand-400/60">
            {t('fuelCostCalc.summary')
              .replace('{cost}', (cost / distance * 100).toFixed(1))
              .replace('{consumption}', String(consumption))}
          </p>
        </div>
      </div>
    </div>
  );
}
