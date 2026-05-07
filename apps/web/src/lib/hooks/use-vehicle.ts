// ============================================================
// TankPilot Web — Vehicle & Persistence Hooks
// ============================================================

'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { VehicleProfile, FavoriteStation, AppSettings, PriceAlert, FuelLogEntry, SavedLocation } from '@tankpilot/core';
import {
  WebStorageAdapter,
  createTypedStorage,
  vehicleProfileSchema,
  favoriteStationSchema,
  appSettingsSchema,
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
} from '@tankpilot/core';
import { z } from 'zod';
import { useAppStore } from '../store/app-store';

const onboardingStorage = createTypedStorage<boolean>(
  new WebStorageAdapter(),
  STORAGE_KEYS.ONBOARDING_DONE,
  z.boolean(),
  false,
);

const adapter = new WebStorageAdapter();

const vehicleStorage = createTypedStorage<VehicleProfile | null>(
  adapter,
  STORAGE_KEYS.VEHICLE_PROFILES,
  vehicleProfileSchema.nullable(),
  null,
);

const favoritesStorage = createTypedStorage<FavoriteStation[]>(
  adapter,
  STORAGE_KEYS.FAVORITES,
  z.array(favoriteStationSchema),
  [],
);

const settingsStorage = createTypedStorage<AppSettings>(
  adapter,
  STORAGE_KEYS.SETTINGS,
  appSettingsSchema,
  DEFAULT_SETTINGS,
);

const priceAlertsStorage = createTypedStorage<PriceAlert[]>(
  adapter,
  STORAGE_KEYS.PRICE_ALERTS,
  z.array(z.object({
    id: z.string(),
    fuelType: z.enum(['diesel', 'e5', 'e10']),
    targetPrice: z.number(),
    enabled: z.boolean(),
    createdAt: z.string(),
    lastTriggered: z.string().optional(),
  })),
  [],
);

const fuelLogStorage = createTypedStorage<FuelLogEntry[]>(
  adapter,
  STORAGE_KEYS.FUEL_LOG,
  z.array(z.object({
    id: z.string(),
    date: z.string(),
    stationName: z.string(),
    stationBrand: z.string(),
    fuelType: z.enum(['diesel', 'e5', 'e10']),
    liters: z.number(),
    pricePerLiter: z.number(),
    totalCost: z.number(),
    odometer: z.number().optional(),
    note: z.string().optional(),
  })),
  [],
);

const geoFenceSchema = z.object({
  id: z.string(),
  label: z.string(),
  stationId: z.string(),
  stationName: z.string(),
  center: z.object({ lat: z.number(), lng: z.number() }),
  radiusKm: z.number().positive().max(50),
  fuelType: z.enum(['diesel', 'e5', 'e10']),
  maxPrice: z.number().nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
});

const geoFencesStorage = createTypedStorage<z.infer<typeof geoFenceSchema>[]>(
  adapter,
  'tp_geo_fences_v1',
  z.array(geoFenceSchema),
  [],
);

const savedLocationsStorage = createTypedStorage<SavedLocation[]>(
  adapter,
  STORAGE_KEYS.SAVED_LOCATIONS,
  z.array(z.object({
    id: z.string(),
    name: z.string(),
    lat: z.number(),
    lng: z.number(),
    icon: z.enum(['home', 'work', 'star', 'pin']),
  })),
  [],
);

/**
 * Hydrate Zustand store from localStorage on mount.
 * Persist changes back whenever the relevant state slices update.
 */
export function useHydrateStore() {
  const hydrated = useRef(false);

  const setVehicle = useAppStore((s) => s.setVehicle);
  const vehicle = useAppStore((s) => s.vehicle);
  const favorites = useAppStore((s) => s.favorites);
  const settings = useAppStore((s) => s.settings);
  const onboardingDone = useAppStore((s) => s.onboardingDone);
  const priceAlerts = useAppStore((s) => s.priceAlerts);
  const fuelLog = useAppStore((s) => s.fuelLog);
  const savedLocations = useAppStore((s) => s.savedLocations);
  const geoFences = useAppStore((s) => s.geoFences);

  // One-time hydration
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    void (async () => {
      const [v, f, s, ob, pa, fl, sl, gf] = await Promise.all([
        vehicleStorage.get(),
        favoritesStorage.get(),
        settingsStorage.get(),
        onboardingStorage.get(),
        priceAlertsStorage.get(),
        fuelLogStorage.get(),
        savedLocationsStorage.get(),
        geoFencesStorage.get(),
      ]);

      if (v) setVehicle(v);
      if (f.length > 0) {
        const store = useAppStore.getState();
        for (const fav of f) store.addFavorite(fav);
      }
      if (s) useAppStore.getState().updateSettings(s);
      if (ob) useAppStore.getState().setOnboardingDone(true);
      if (pa.length > 0) useAppStore.getState().setPriceAlerts(pa);
      if (fl.length > 0) useAppStore.getState().setFuelLog(fl);
      if (sl.length > 0) useAppStore.getState().setSavedLocations(sl);
      if (gf.length > 0) {
        const store = useAppStore.getState();
        for (const fence of gf) store.addGeoFence(fence);
      }
    })();
  }, [setVehicle]);

  // Persist on changes
  useEffect(() => {
    if (!hydrated.current) return;
    void vehicleStorage.set(vehicle);
  }, [vehicle]);

  useEffect(() => {
    if (!hydrated.current) return;
    void favoritesStorage.set(favorites);
  }, [favorites]);

  useEffect(() => {
    if (!hydrated.current) return;
    void settingsStorage.set(settings);
  }, [settings]);

  useEffect(() => {
    if (!hydrated.current) return;
    void onboardingStorage.set(onboardingDone);
  }, [onboardingDone]);

  useEffect(() => {
    if (!hydrated.current) return;
    void priceAlertsStorage.set(priceAlerts);
  }, [priceAlerts]);

  useEffect(() => {
    if (!hydrated.current) return;
    void fuelLogStorage.set(fuelLog);
  }, [fuelLog]);

  useEffect(() => {
    if (!hydrated.current) return;
    void savedLocationsStorage.set(savedLocations);
  }, [savedLocations]);

  useEffect(() => {
    if (!hydrated.current) return;
    void geoFencesStorage.set(geoFences);
  }, [geoFences]);
}

/**
 * Hook to manage the vehicle form state.
 */
export function useVehicleActions() {
  const setVehicle = useAppStore((s) => s.setVehicle);

  const saveVehicle = useCallback(
    (vehicle: VehicleProfile) => {
      setVehicle(vehicle);
    },
    [setVehicle],
  );

  const clearVehicle = useCallback(() => {
    setVehicle(null);
  }, [setVehicle]);

  return { saveVehicle, clearVehicle };
}
