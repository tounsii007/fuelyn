// ============================================================
// FilterPanel — Extended filter with energy types, connectors,
// station types, brand, price range, and EV-specific options
// ============================================================

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { KNOWN_BRANDS, KNOWN_CHARGING_OPERATORS } from '@fuelyn/core';
import type { EnergyType, ConnectorType, ChargingSpeed, StationType } from '@fuelyn/core';
import { STATION_TYPE_LABELS, STATION_TYPE_ICONS, isElectricType } from '@fuelyn/core';
import { EnergyTypeChips } from './EnergyTypeChips';
import { ConnectorFilter } from './ConnectorFilter';

const PRICE_MIN = 0.5;
const PRICE_MAX = 3.0;
const PRICE_STEP = 0.05;

const ALL_BRANDS = [...KNOWN_BRANDS, ...KNOWN_CHARGING_OPERATORS];

export function FilterPanel() {
  const { t } = useTranslations();
  const isOpen = useAppStore((s) => s.isFilterOpen);
  const setFilterOpen = useAppStore((s) => s.setFilterOpen);
  const filter = useAppStore((s) => s.filter);
  const setFilter = useAppStore((s) => s.setFilter);

  // Local state
  const [selectedBrands, setSelectedBrands] = useState<string[]>([...filter.brands]);
  const [onlyOpen, setOnlyOpen] = useState(filter.onlyOpen);
  const [priceMin, setPriceMin] = useState(filter.priceMin ?? PRICE_MIN);
  const [priceMax, setPriceMax] = useState(filter.priceMax ?? PRICE_MAX);

  // Extended filter state from store
  const storeEnergyTypes = useAppStore((s) => s.selectedEnergyTypes);
  const storeStationTypes = useAppStore((s) => s.selectedStationTypes);
  const storeConnectorTypes = useAppStore((s) => s.selectedConnectorTypes);
  const storeChargingTypes = useAppStore((s) => s.selectedChargingTypes);
  const storeMinPowerKW = useAppStore((s) => s.selectedMinPowerKW);

  const [energyTypes, setEnergyTypes] = useState<EnergyType[]>([...storeEnergyTypes]);
  const [stationTypes, setStationTypes] = useState<StationType[]>([...storeStationTypes]);
  const [connectorTypes, setConnectorTypes] = useState<ConnectorType[]>([...storeConnectorTypes]);
  const [chargingTypes, setChargingTypes] = useState<ChargingSpeed[]>([...storeChargingTypes]);
  const [minPowerKW, setMinPowerKW] = useState<number | null>(storeMinPowerKW);

  // Re-sync the local working copy from the store each time the panel opens,
  // so edits made elsewhere (BrandQuickFilter / AppShell) aren't clobbered by
  // a stale draft when the user hits Apply. Only on the open transition — we
  // don't wipe in-progress edits on every store tick.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedBrands([...filter.brands]);
    setOnlyOpen(filter.onlyOpen);
    setPriceMin(filter.priceMin ?? PRICE_MIN);
    setPriceMax(filter.priceMax ?? PRICE_MAX);
    setEnergyTypes([...storeEnergyTypes]);
    setStationTypes([...storeStationTypes]);
    setConnectorTypes([...storeConnectorTypes]);
    setChargingTypes([...storeChargingTypes]);
    setMinPowerKW(storeMinPowerKW);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync only when `isOpen` flips
  }, [isOpen]);

  // Show EV filter section when electric types are selected
  const showEvFilters = useMemo(
    () => energyTypes.some(isElectricType),
    [energyTypes],
  );

  // Show price range only when fuel-type stations are selected
  const showPriceFilter = useMemo(
    () => energyTypes.some((t) => !isElectricType(t)),
    [energyTypes],
  );

  const handleApply = useCallback(() => {
    setFilter({
      brands: selectedBrands,
      onlyOpen,
      priceMin: priceMin <= PRICE_MIN ? null : priceMin,
      priceMax: priceMax >= PRICE_MAX ? null : priceMax,
    });

    // Store extended filter state via proper Zustand actions
    const store = useAppStore.getState();
    store.setSelectedEnergyTypes(energyTypes);
    store.setSelectedStationTypes(stationTypes);
    store.setSelectedConnectorTypes(connectorTypes);
    store.setSelectedChargingTypes(chargingTypes);
    store.setSelectedMinPowerKW(minPowerKW);

    setFilterOpen(false);
  }, [selectedBrands, onlyOpen, priceMin, priceMax, energyTypes, stationTypes, connectorTypes, chargingTypes, minPowerKW, setFilter, setFilterOpen]);

  const handleReset = useCallback(() => {
    setSelectedBrands([]);
    setOnlyOpen(false);
    setPriceMin(PRICE_MIN);
    setPriceMax(PRICE_MAX);
    setEnergyTypes(['diesel', 'e5', 'e10']);
    setStationTypes([]);
    setConnectorTypes([]);
    setChargingTypes([]);
    setMinPowerKW(null);
    setFilter({
      brands: [],
      onlyOpen: false,
      priceMin: null,
      priceMax: null,
    });
    setFilterOpen(false);
  }, [setFilter, setFilterOpen]);

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand)
        ? prev.filter((b) => b !== brand)
        : [...prev, brand],
    );
  };

  const toggleStationType = (type: StationType) => {
    setStationTypes((prev) =>
      prev.includes(type)
        ? prev.filter((t) => t !== type)
        : [...prev, type],
    );
  };

  if (!isOpen) return null;

  const activeFilterCount =
    selectedBrands.length +
    (onlyOpen ? 1 : 0) +
    (priceMin > PRICE_MIN ? 1 : 0) +
    (priceMax < PRICE_MAX ? 1 : 0) +
    (connectorTypes.length > 0 ? 1 : 0) +
    (chargingTypes.length > 0 ? 1 : 0) +
    (minPowerKW != null ? 1 : 0) +
    (stationTypes.length > 0 ? 1 : 0);

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={() => setFilterOpen(false)}
      />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white dark:bg-surface-dark-secondary
                      rounded-t-3xl shadow-sheet animate-slide-up max-h-[90vh] flex flex-col">
        {/* Handle + Header */}
        <div className="px-5 pt-3 pb-4 border-b border-gray-100 dark:border-gray-700">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('filterPanel.title')}</h2>
            <button
              type="button"
              onClick={() => setFilterOpen(false)}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-6">

          {/* Energy Types */}
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              {t('filterPanel.energyType')}
            </p>
            <EnergyTypeChips
              selected={energyTypes}
              onChange={setEnergyTypes}
              grouped
              compact
            />
          </div>

          {/* Station Type Filter */}
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
              {t('filterPanel.stationType')}
            </p>
            <div className="flex flex-wrap gap-2">
              {(['fuel', 'charging', 'hydrogen', 'gas'] as StationType[]).map((type) => {
                const isSelected = stationTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleStationType(type)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all border
                      ${isSelected
                        ? 'bg-brand-600 text-white border-brand-600 shadow-sm'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-brand-400'
                      }`}
                  >
                    <span>{STATION_TYPE_ICONS[type]}</span>
                    <span>{STATION_TYPE_LABELS[type]}</span>
                  </button>
                );
              })}
            </div>
            {stationTypes.length === 0 && (
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                {t('filterPanel.stationTypeHint')}
              </p>
            )}
          </div>

          {/* Only Open Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('filterPanel.onlyOpen')}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('filterPanel.onlyOpenDesc')}</p>
            </div>
            <button
              type="button"
              onClick={() => setOnlyOpen(!onlyOpen)}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                onlyOpen ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  onlyOpen ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Price Range (fuel/gas/H2 only) */}
          {showPriceFilter && (
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">{t('filterPanel.priceRange')}</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('filterPanel.priceMin')}</label>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      value={priceMin.toFixed(2)}
                      onChange={(e) => setPriceMin(Math.max(PRICE_MIN, Number(e.target.value)))}
                      step={PRICE_STEP}
                      min={PRICE_MIN}
                      max={priceMax}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                                 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                                 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <span className="text-xs text-gray-400">&euro;</span>
                  </div>
                </div>
                <span className="text-gray-300 dark:text-gray-600 mt-5">&mdash;</span>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('filterPanel.priceMax')}</label>
                  <div className="flex items-center gap-1 mt-1">
                    <input
                      type="number"
                      value={priceMax.toFixed(2)}
                      onChange={(e) => setPriceMax(Math.min(PRICE_MAX, Number(e.target.value)))}
                      step={PRICE_STEP}
                      min={priceMin}
                      max={PRICE_MAX}
                      className="w-full px-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-600
                                 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                                 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <span className="text-xs text-gray-400">&euro;</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* EV-specific Filters */}
          {showEvFilters && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">⚡</span>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('filterPanel.evFilters')}</p>
              </div>
              <ConnectorFilter
                selectedConnectors={connectorTypes}
                onConnectorsChange={setConnectorTypes}
                selectedSpeeds={chargingTypes}
                onSpeedsChange={setChargingTypes}
                minPowerKW={minPowerKW}
                onMinPowerChange={setMinPowerKW}
              />
            </div>
          )}

          {/* Brand / Operator Filter */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t('filterPanel.brandsLabel')}</p>
              {selectedBrands.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedBrands([])}
                  className="text-xs text-brand-600 hover:text-brand-700"
                >
                  {t('filterPanel.deselectAll')}
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_BRANDS.map((brand) => {
                const isSelected = selectedBrands.includes(brand);
                return (
                  <button
                    key={brand}
                    type="button"
                    onClick={() => toggleBrand(brand)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border
                      ${
                        isSelected
                          ? 'bg-brand-600 text-white border-brand-600'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-brand-400'
                      }`}
                  >
                    {brand}
                  </button>
                );
              })}
            </div>
            {selectedBrands.length === 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                {t('filterPanel.brandsHint')}
              </p>
            )}
          </div>
        </div>

        {/* Footer Buttons */}
        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-700 flex gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold
                       bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300
                       hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            {t('filterPanel.reset')}
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold
                       bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800
                       transition-colors shadow-sm"
          >
            {t('filterPanel.apply')}
            {activeFilterCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5
                               bg-white/20 rounded-full text-[10px]">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
