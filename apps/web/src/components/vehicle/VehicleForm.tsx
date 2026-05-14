// ============================================================
// VehicleForm - Inline form for vehicle profile
// ============================================================

'use client';

import { useState, useCallback } from 'react';
import type { FuelType, FuelLevelUnit, DriveType, VehicleProfile } from '@fuelyn/core';
import { FUEL_TYPES, FUEL_TYPE_LABELS, DRIVE_TYPE_LABELS } from '@fuelyn/core';
import { searchVehicleModels } from '@fuelyn/core/domain/vehicles';
import type { VehicleModel } from '@fuelyn/core/domain/vehicles';
import { useAppStore } from '@/lib/store/app-store';
import { useVehicleActions } from '@/lib/hooks/use-vehicle';
import { useTranslations } from '@/lib/hooks/use-translations';
import { Autocomplete } from '../ui/Autocomplete';

const DRIVE_TYPES: DriveType[] = ['benzin', 'diesel', 'hybrid', 'elektro', 'gas', 'h2'];

const DRIVE_TYPE_ICONS: Record<DriveType, string> = {
  benzin: '⛽',
  diesel: '⛽',
  hybrid: '🔋⛽',
  elektro: '🔌',
  gas: '🔥',
  h2: '💧',
};

interface VehicleFormProps {
  onClose: () => void;
}

export function VehicleForm({ onClose }: VehicleFormProps) {
  const { t } = useTranslations();
  const existingVehicle = useAppStore((s) => s.vehicle);
  const { saveVehicle } = useVehicleActions();

  const [name, setName] = useState(existingVehicle?.name ?? '');
  const [driveType, setDriveType] = useState<DriveType>(existingVehicle?.driveType ?? 'benzin');
  const [fuelType, setFuelType] = useState<FuelType>(existingVehicle?.fuelType ?? 'e10');
  const [consumption, setConsumption] = useState(existingVehicle?.consumption?.toString() ?? '');
  const [tankCapacity, setTankCapacity] = useState(existingVehicle?.tankCapacity?.toString() ?? '');
  const [batteryCapacity, setBatteryCapacity] = useState(existingVehicle?.batteryCapacity?.toString() ?? '');
  const [fuelLevel, setFuelLevel] = useState(existingVehicle?.currentFuelLevel?.toString() ?? '');
  const [fuelUnit, setFuelUnit] = useState<FuelLevelUnit>(existingVehicle?.currentFuelUnit ?? 'km');

  const isElectric = driveType === 'elektro';
  const isHybrid = driveType === 'hybrid';
  const isH2 = driveType === 'h2';
  const showFuelFields = !isElectric && !isH2;
  const showBatteryField = isElectric || isHybrid;

  const handleModelSearch = useCallback((query: string) => searchVehicleModels(query), []);

  const handleModelSelect = (model: VehicleModel) => {
    setName(model.label);
    setDriveType(model.defaultDriveType);
    setFuelType(model.defaultFuelType);
    setConsumption(String(model.typicalConsumption));
    setTankCapacity(model.typicalTankCapacity > 0 ? String(model.typicalTankCapacity) : '');
    setBatteryCapacity(model.typicalBatteryCapacity ? String(model.typicalBatteryCapacity) : '');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const parsedConsumption = parseFloat(consumption);
    const parsedTankCapacity = tankCapacity ? parseFloat(tankCapacity) : null;
    const parsedBatteryCapacity = batteryCapacity ? parseFloat(batteryCapacity) : null;
    const parsedFuelLevel = fuelLevel ? parseFloat(fuelLevel) : null;

    if (!name.trim() || !Number.isFinite(parsedConsumption) || parsedConsumption <= 0) return;
    if (parsedTankCapacity != null && (!Number.isFinite(parsedTankCapacity) || parsedTankCapacity <= 0)) return;
    if (parsedBatteryCapacity != null && (!Number.isFinite(parsedBatteryCapacity) || parsedBatteryCapacity <= 0)) return;
    if (parsedFuelLevel != null && (!Number.isFinite(parsedFuelLevel) || parsedFuelLevel < 0)) return;

    const vehicle: VehicleProfile = {
      id: existingVehicle?.id ?? crypto.randomUUID(),
      name: name.trim(),
      fuelType,
      driveType,
      consumption: parsedConsumption,
      tankCapacity: parsedTankCapacity,
      batteryCapacity: parsedBatteryCapacity,
      currentRange: fuelUnit === 'km' ? parsedFuelLevel : null,
      currentFuelLevel: parsedFuelLevel,
      currentFuelUnit: fuelUnit,
    };

    saveVehicle(vehicle);
    onClose();
  };

  return (
    <div className="animate-slide-up bg-white dark:bg-surface-dark-secondary rounded-3xl shadow-sheet p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('vehicle.title')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label={t('common.close')}
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Autocomplete<VehicleModel>
          value={name}
          onChange={setName}
          onSelect={handleModelSelect}
          search={handleModelSearch}
          getItemKey={(model) => model.label}
          renderItem={(model) => (
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{model.brand}</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">{model.model}</span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                <span>{model.typicalConsumption} L</span>
                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
                <span>{model.typicalTankCapacity} L Tank</span>
              </div>
            </div>
          )}
          label={t('vehicle.modelLabel')}
          id="vehicle-name"
          placeholder={t('vehicle.modelPlaceholder')}
        />

        {/* Drive Type Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('vehicle.driveTypeFormLabel')}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {DRIVE_TYPES.map((dt) => (
              <button
                key={dt}
                type="button"
                onClick={() => {
                  setDriveType(dt);
                  // Auto-set fuel type based on drive type
                  if (dt === 'diesel') setFuelType('diesel');
                  else if (dt === 'benzin' && fuelType === 'diesel') setFuelType('e10');
                  else if (dt === 'hybrid' && fuelType === 'diesel') setFuelType('e10');
                  else if (dt === 'gas' && fuelType === 'diesel') setFuelType('e10');
                }}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl text-xs font-medium transition-all
                  ${driveType === dt
                    ? dt === 'elektro'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : dt === 'hybrid'
                        ? 'bg-teal-600 text-white shadow-sm'
                        : dt === 'h2'
                          ? 'bg-cyan-600 text-white shadow-sm'
                          : dt === 'gas'
                            ? 'bg-orange-600 text-white shadow-sm'
                            : 'bg-brand-600 text-white shadow-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
              >
                <span className="text-base">{DRIVE_TYPE_ICONS[dt]}</span>
                <span>{DRIVE_TYPE_LABELS[dt]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Fuel Type Selector (hidden for pure electric) */}
        {showFuelFields && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('vehicle.fuelType')}
            </label>
            <div className="flex gap-2">
              {FUEL_TYPES.map((ft) => (
                <button
                  key={ft}
                  type="button"
                  onClick={() => setFuelType(ft)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all
                    ${fuelType === ft
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                >
                  {FUEL_TYPE_LABELS[ft]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="consumption" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('vehicle.consumptionShort')} ({isElectric ? t('vehicle.consumptionUnitElectric') : isH2 ? t('vehicle.consumptionUnitH2') : t('vehicle.consumptionUnit')})
          </label>
          <input
            id="consumption"
            type="number"
            step="0.1"
            min="1"
            max="50"
            value={consumption}
            onChange={(e) => setConsumption(e.target.value)}
            placeholder={t('vehicle.consumptionPlaceholder')}
            required
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600
                       bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2
                       focus:ring-brand-500 focus:border-transparent transition-colors"
          />
        </div>

        {/* Tank capacity (hidden for pure electric) */}
        {showFuelFields && (
          <div>
            <label htmlFor="tank-capacity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('vehicle.tankCapacityWithUnit')}
              <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">({t('vehicle.tankCapacityOptional')})</span>
            </label>
            <input
              id="tank-capacity"
              type="number"
              step="1"
              min="10"
              max="200"
              value={tankCapacity}
              onChange={(e) => setTankCapacity(e.target.value)}
              placeholder={t('vehicle.tankCapacityPlaceholder')}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600
                         bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                         text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2
                         focus:ring-brand-500 focus:border-transparent transition-colors"
            />
          </div>
        )}

        {/* Battery capacity (shown for hybrid and electric) */}
        {showBatteryField && (
          <div>
            <label htmlFor="battery-capacity" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('vehicle.batteryCapacityWithUnit')}
              <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">({t('vehicle.tankCapacityOptional')})</span>
            </label>
            <input
              id="battery-capacity"
              type="number"
              step="0.1"
              min="1"
              max="200"
              value={batteryCapacity}
              onChange={(e) => setBatteryCapacity(e.target.value)}
              placeholder={isElectric ? t('vehicle.batteryCapacityPlaceholderElectric') : t('vehicle.batteryCapacityPlaceholderHybrid')}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600
                         bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                         text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2
                         focus:ring-brand-500 focus:border-transparent transition-colors"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {t('vehicle.currentFuelLevel')}
          </label>
          <div className="flex gap-2 mb-2">
            {([
              { value: 'km' as const, label: 'km' },
              { value: 'liters' as const, label: t('vehicle.fuelLevelLiters') },
              { value: 'percentage' as const, label: '%' },
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFuelUnit(option.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${fuelUnit === option.value
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                  }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <input
            type="number"
            step="1"
            min="0"
            value={fuelLevel}
            onChange={(e) => setFuelLevel(e.target.value)}
            placeholder={
              fuelUnit === 'km'
                ? t('vehicle.fuelLevelPlaceholderKm')
                : fuelUnit === 'liters'
                  ? t('vehicle.fuelLevelPlaceholderLiters')
                  : t('vehicle.fuelLevelPlaceholderPercent')
            }
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600
                       bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2
                       focus:ring-brand-500 focus:border-transparent transition-colors"
          />
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-brand-600 text-white text-sm font-semibold rounded-xl
                     hover:bg-brand-700 active:bg-brand-800 transition-colors
                     focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
                     shadow-sm"
        >
          {t('vehicle.saveVehicle')}
        </button>
      </form>
    </div>
  );
}
