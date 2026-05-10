// ============================================================
// Fuelyn Web — Vehicle & Persistence Hooks
// ============================================================

'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { VehicleProfile, FavoriteStation, AppSettings, PriceAlert, FuelLogEntry, SavedLocation, Subscription } from '@fuelyn/core';
import {
  WebStorageAdapter,
  createTypedStorage,
  vehicleProfileSchema,
  favoriteStationSchema,
  appSettingsSchema,
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
} from '@fuelyn/core';
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

const activeMembershipsStorage = createTypedStorage<string[]>(
  adapter,
  STORAGE_KEYS.ACTIVE_MEMBERSHIPS,
  z.array(z.string()),
  [],
);

// Multi-vehicle storage (Iter P) — list of profiles + active id.
// Reads gracefully fall back to the legacy single-vehicle key when the
// new keys are empty, so existing users transparently upgrade.
const vehiclesListStorage = createTypedStorage<VehicleProfile[]>(
  adapter,
  STORAGE_KEYS.VEHICLES_LIST,
  z.array(vehicleProfileSchema),
  [],
);

const activeVehicleIdStorage = createTypedStorage<string | null>(
  adapter,
  STORAGE_KEYS.ACTIVE_VEHICLE_ID,
  z.string().nullable(),
  null,
);

// Stripe subscription state (Iter T). Default = free tier.
const subscriptionSchema = z.object({
  status: z.enum(['free', 'trial', 'active', 'past_due', 'cancelled']),
  currentPeriodEnd: z.string().optional(),
  plan: z.enum(['monthly', 'annual', 'lifetime']).nullable().optional(),
  stripeSubscriptionId: z.string().optional(),
  stripeCustomerId: z.string().optional(),
});
const subscriptionStorage = createTypedStorage<Subscription>(
  adapter,
  'fuelyn:subscription',
  subscriptionSchema,
  { status: 'free', plan: null },
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
  const setVehicles = useAppStore((s) => s.setVehicles);
  const setActiveVehicleId = useAppStore((s) => s.setActiveVehicleId);
  const setSubscription = useAppStore((s) => s.setSubscription);
  const vehicle = useAppStore((s) => s.vehicle);
  const vehicles = useAppStore((s) => s.vehicles);
  const activeVehicleId = useAppStore((s) => s.activeVehicleId);
  const subscription = useAppStore((s) => s.subscription);
  const favorites = useAppStore((s) => s.favorites);
  const settings = useAppStore((s) => s.settings);
  const onboardingDone = useAppStore((s) => s.onboardingDone);
  const priceAlerts = useAppStore((s) => s.priceAlerts);
  const fuelLog = useAppStore((s) => s.fuelLog);
  const savedLocations = useAppStore((s) => s.savedLocations);
  const geoFences = useAppStore((s) => s.geoFences);
  const activeMemberships = useAppStore((s) => s.activeMemberships);

  // One-time hydration
  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    void (async () => {
      const [v, f, s, ob, pa, fl, sl, gf, am, vl, av, subs] = await Promise.all([
        vehicleStorage.get(),
        favoritesStorage.get(),
        settingsStorage.get(),
        onboardingStorage.get(),
        priceAlertsStorage.get(),
        fuelLogStorage.get(),
        savedLocationsStorage.get(),
        geoFencesStorage.get(),
        activeMembershipsStorage.get(),
        vehiclesListStorage.get(),
        activeVehicleIdStorage.get(),
        subscriptionStorage.get(),
      ]);

      // ----- Multi-vehicle hydration with legacy fallback -----
      if (vl.length > 0) {
        // New-style storage wins. Restore the list AND the active id;
        // setVehicles already snaps `vehicle` to the right entry.
        setVehicles(vl);
        if (av) setActiveVehicleId(av);
      } else if (v) {
        // Legacy single-vehicle profile — promote to a one-element list.
        setVehicle(v);
      }
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
      if (am.length > 0) useAppStore.getState().setActiveMemberships(am);
      if (subs && subs.status !== 'free') setSubscription(subs);
    })();
  }, [setVehicle, setVehicles, setActiveVehicleId, setSubscription]);

  // Persist on changes — both the legacy single-vehicle slot (kept in
  // sync so older app builds can still load the active profile) and
  // the new multi-vehicle list + active-id slots.
  useEffect(() => {
    if (!hydrated.current) return;
    void vehicleStorage.set(vehicle);
  }, [vehicle]);

  useEffect(() => {
    if (!hydrated.current) return;
    void vehiclesListStorage.set(vehicles);
  }, [vehicles]);

  useEffect(() => {
    if (!hydrated.current) return;
    void activeVehicleIdStorage.set(activeVehicleId);
  }, [activeVehicleId]);

  useEffect(() => {
    if (!hydrated.current) return;
    void subscriptionStorage.set(subscription);
  }, [subscription]);

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

  useEffect(() => {
    if (!hydrated.current) return;
    void activeMembershipsStorage.set(activeMemberships);
  }, [activeMemberships]);
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
