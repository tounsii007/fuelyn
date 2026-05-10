// ============================================================
// Fuelyn Web — Application State (Zustand)
// Lightweight global state for UI concerns. Server data lives
// in React Query; this store holds local/client-only state.
// ============================================================

'use client';

import { create } from 'zustand';
import type {
  Coordinates,
  FuelType,
  SortMode,
  StationFilter,
  VehicleProfile,
  FavoriteStation,
  AppSettings,
  ThemeMode,
  AppLocale,
  RouteData,
  Station,
  PriceAlert,
  FuelLogEntry,
  SavedLocation,
  EnergyType,
  StationType,
  ConnectorType,
  ChargingSpeed,
} from '@fuelyn/core';
import { DEFAULT_FILTER, DEFAULT_SETTINGS } from '@fuelyn/core';

const MAX_COMPARE_STATIONS = 3;
const MAX_SEARCH_HISTORY = 10;
const MAX_PRICE_HISTORY = 500;

function isFiniteCoordinate(value: Coordinates | null): value is Coordinates {
  return Boolean(
    value &&
    Number.isFinite(value.lat) &&
    Number.isFinite(value.lng) &&
    value.lat >= -90 &&
    value.lat <= 90 &&
    value.lng >= -180 &&
    value.lng <= 180,
  );
}

function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

// ─── State Shape ─────────────────────────────────────────────

interface AppState {
  // Location
  userLocation: Coordinates | null;
  /** Horizontal accuracy of the latest GPS fix in metres. `null`
   *  when the source is non-GPS (search-bar pick, demo fallback) or
   *  the platform didn't report it. Drives the uncertainty circle
   *  on the map and the "±NN m" hint in the search bar. */
  userLocationAccuracy: number | null;
  /** True while a continuous watchPosition is active and pushing
   *  updates into the store — drives the "live" pulsing dot on the
   *  map and lets consumers know coords may shift soon. */
  liveTracking: boolean;
  locationPermission: 'prompt' | 'granted' | 'denied';
  setUserLocation: (coords: Coordinates | null) => void;
  setUserLocationAccuracy: (meters: number | null) => void;
  setLiveTracking: (live: boolean) => void;
  /** Update coords + accuracy atomically — the GPS hook uses this
   *  so the map never paints a new dot with the old uncertainty
   *  circle (or vice-versa) for a single frame. */
  setGeolocatedPosition: (coords: Coordinates, accuracyMeters: number | null) => void;
  setLocationPermission: (status: 'prompt' | 'granted' | 'denied') => void;

  // Search & Filter
  filter: StationFilter;
  sortMode: SortMode;
  setFilter: (partial: Partial<StationFilter>) => void;
  setSortMode: (mode: SortMode) => void;
  setFuelType: (type: FuelType) => void;
  resetFilter: () => void;

  // Vehicle (multi-vehicle aware — see Iter P)
  // ----------------------------------------------------------------
  // The collection lives in `vehicles[]`; `activeVehicleId` selects
  // which one is current. `vehicle` is a *derived* convenience getter
  // (kept around so existing call-sites don't have to change). Legacy
  // setVehicle continues to work and is mapped to upsert + setActive.
  vehicles: VehicleProfile[];
  activeVehicleId: string | null;
  vehicle: VehicleProfile | null; // derived view, kept as plain field for selector simplicity
  setVehicle: (vehicle: VehicleProfile | null) => void;
  addVehicle: (vehicle: VehicleProfile) => void;
  removeVehicle: (id: string) => void;
  updateVehicle: (id: string, patch: Partial<VehicleProfile>) => void;
  setActiveVehicleId: (id: string | null) => void;
  setVehicles: (list: VehicleProfile[]) => void;

  // Favorites
  favorites: FavoriteStation[];
  addFavorite: (fav: FavoriteStation) => void;
  removeFavorite: (stationId: string) => void;
  isFavorite: (stationId: string) => boolean;

  // Settings
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
  setTheme: (theme: ThemeMode) => void;
  setLocale: (locale: AppLocale) => void;

  // Brand membership / loyalty cards.
  // Stored as a string-array of `MembershipId` values from
  // @fuelyn/core. Stations of matching brands display the
  // effective price (sticker minus card discount).
  activeMemberships: string[];
  toggleMembership: (id: string) => void;
  setActiveMemberships: (ids: string[]) => void;

  // Map search (search from map center when panning)
  mapCenter: Coordinates | null;
  mapRadiusKm: number;
  setMapCenter: (center: Coordinates | null) => void;
  setMapRadiusKm: (radius: number) => void;
  setMapView: (center: Coordinates | null, radiusKm: number) => void;

  // UI
  selectedStationId: string | null;
  isMapView: boolean;
  isFilterOpen: boolean;
  isVehicleFormOpen: boolean;
  onboardingDone: boolean;
  selectStation: (id: string | null) => void;
  toggleView: () => void;
  setFilterOpen: (open: boolean) => void;
  setVehicleFormOpen: (open: boolean) => void;
  setOnboardingDone: (done: boolean) => void;

  // Route
  activeRoute: RouteData | null;
  routeTarget: Station | null;
  routeLoading: boolean;
  setActiveRoute: (route: RouteData | null, target: Station | null) => void;
  setRouteLoading: (loading: boolean) => void;
  clearRoute: () => void;

  // Navigation
  isNavigating: boolean;
  currentStepIndex: number;
  navPosition: Coordinates | null;
  navHeading: number;
  remainingDistance: number;
  remainingDuration: number;
  startNavigation: () => void;
  stopNavigation: () => void;
  updateNavPosition: (pos: Coordinates, heading: number) => void;
  advanceStep: () => void;
  setRemainingRoute: (distance: number, duration: number) => void;

  // Price Alerts
  priceAlerts: PriceAlert[];
  addPriceAlert: (alert: PriceAlert) => void;
  removePriceAlert: (id: string) => void;
  togglePriceAlert: (id: string) => void;
  setPriceAlerts: (alerts: PriceAlert[]) => void;

  // Fuel Log
  fuelLog: FuelLogEntry[];
  addFuelLogEntry: (entry: FuelLogEntry) => void;
  removeFuelLogEntry: (id: string) => void;
  setFuelLog: (log: FuelLogEntry[]) => void;

  // Saved Locations
  savedLocations: SavedLocation[];
  addSavedLocation: (loc: SavedLocation) => void;
  removeSavedLocation: (id: string) => void;
  setSavedLocations: (locs: SavedLocation[]) => void;

  // Push Notification Preferences
  priceAlertEnabled: boolean;
  priceAlertThreshold: Record<FuelType, number | null>;
  notificationPermission: NotificationPermission | null;
  setPriceAlertEnabled: (enabled: boolean) => void;
  setPriceAlertThreshold: (fuelType: FuelType, price: number | null) => void;
  setNotificationPermission: (permission: NotificationPermission | null) => void;

  // Extended Filter (energy types, connectors, etc.)
  selectedEnergyTypes: EnergyType[];
  selectedStationTypes: StationType[];
  selectedConnectorTypes: ConnectorType[];
  selectedChargingTypes: ChargingSpeed[];
  selectedMinPowerKW: number | null;
  setSelectedEnergyTypes: (types: EnergyType[]) => void;
  setSelectedStationTypes: (types: StationType[]) => void;
  setSelectedConnectorTypes: (types: ConnectorType[]) => void;
  setSelectedChargingTypes: (types: ChargingSpeed[]) => void;
  setSelectedMinPowerKW: (kw: number | null) => void;

  // Compare
  compareStationIds: string[];
  toggleCompareStation: (id: string) => void;
  clearCompare: () => void;

  // Search History
  searchHistory: { lat: number; lng: number; label: string; timestamp: string }[];
  addSearchHistory: (entry: { lat: number; lng: number; label: string; timestamp: string }) => void;
  clearSearchHistory: () => void;

  // Price History
  priceHistory: { stationId: string; fuelType: string; price: number; timestamp: string }[];
  addPriceSnapshot: (snap: { stationId: string; fuelType: string; price: number; timestamp: string }) => void;
  clearPriceHistory: () => void;

  // Geo-fenced price alerts
  geoFences: GeoFenceState[];
  addGeoFence: (fence: GeoFenceState) => void;
  updateGeoFence: (id: string, partial: Partial<GeoFenceState>) => void;
  removeGeoFence: (id: string) => void;
  setGeoFenceEnabled: (id: string, enabled: boolean) => void;
}

/** Stored geo-fence shape (compatible with @fuelyn/core's GeoFence). */
export interface GeoFenceState {
  readonly id: string;
  readonly label: string;
  readonly stationId: string;
  readonly stationName: string;
  readonly center: { lat: number; lng: number };
  readonly radiusKm: number;
  readonly fuelType: 'diesel' | 'e5' | 'e10';
  readonly maxPrice: number | null;
  readonly enabled: boolean;
  readonly createdAt: string;
}

// ─── Store ───────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  // Location
  userLocation: null,
  userLocationAccuracy: null,
  liveTracking: false,
  locationPermission: 'prompt',
  setUserLocation: (coords) =>
    set({
      userLocation: isFiniteCoordinate(coords) ? coords : null,
      // Non-GPS location sources (search-bar pick, demo fallback)
      // have no meaningful accuracy radius — clearing avoids
      // painting a stale uncertainty circle from the previous fix
      // around a freshly-picked address.
      userLocationAccuracy: null,
    }),
  setUserLocationAccuracy: (meters) =>
    set({
      userLocationAccuracy:
        meters !== null && Number.isFinite(meters) && meters >= 0 ? meters : null,
    }),
  setLiveTracking: (live) => set({ liveTracking: live }),
  setGeolocatedPosition: (coords, accuracyMeters) =>
    set({
      userLocation: isFiniteCoordinate(coords) ? coords : null,
      userLocationAccuracy:
        isFiniteCoordinate(coords) &&
        accuracyMeters !== null &&
        Number.isFinite(accuracyMeters) &&
        accuracyMeters >= 0
          ? accuracyMeters
          : null,
    }),
  setLocationPermission: (status) => set({ locationPermission: status }),

  // Search & Filter
  filter: DEFAULT_FILTER,
  sortMode: 'recommended',
  setFilter: (partial) =>
    set((s) => ({ filter: { ...s.filter, ...partial } })),
  setSortMode: (mode) => set({ sortMode: mode }),
  setFuelType: (type) =>
    set((s) => ({ filter: { ...s.filter, fuelType: type } })),
  resetFilter: () => set({ filter: DEFAULT_FILTER }),

  // Vehicle (multi-vehicle, see Iter P)
  vehicles: [],
  activeVehicleId: null,
  vehicle: null,
  setVehicle: (v) =>
    set((s) => {
      if (!v) {
        // null: clear active pointer but keep the list intact
        return { vehicle: null, activeVehicleId: null };
      }
      // Upsert by id and make this one active.
      const list = [...s.vehicles];
      const idx = list.findIndex((x) => x.id === v.id);
      if (idx >= 0) list[idx] = v;
      else list.push(v);
      return { vehicles: list, activeVehicleId: v.id, vehicle: v };
    }),
  addVehicle: (v) =>
    set((s) => {
      // Auto-pick a unique id when the caller hasn't supplied one.
      const id = v.id && v.id.trim() ? v.id : `veh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const next: VehicleProfile = { ...v, id };
      const list = [...s.vehicles, next];
      // First vehicle becomes active automatically.
      const becomesActive = s.activeVehicleId == null;
      return {
        vehicles: list,
        activeVehicleId: becomesActive ? id : s.activeVehicleId,
        vehicle: becomesActive ? next : s.vehicle,
      };
    }),
  removeVehicle: (id) =>
    set((s) => {
      const list = s.vehicles.filter((v) => v.id !== id);
      // If the active vehicle was just removed, fall back to the
      // first remaining one (or null when nothing's left).
      const stillActive = list.find((v) => v.id === s.activeVehicleId);
      const nextActiveId = stillActive ? stillActive.id : list[0]?.id ?? null;
      const nextActive = list.find((v) => v.id === nextActiveId) ?? null;
      return { vehicles: list, activeVehicleId: nextActiveId, vehicle: nextActive };
    }),
  updateVehicle: (id, patch) =>
    set((s) => {
      const list = s.vehicles.map((v) => (v.id === id ? { ...v, ...patch } : v));
      const active = list.find((v) => v.id === s.activeVehicleId) ?? null;
      return { vehicles: list, vehicle: active };
    }),
  setActiveVehicleId: (id) =>
    set((s) => ({
      activeVehicleId: id,
      vehicle: id ? s.vehicles.find((v) => v.id === id) ?? null : null,
    })),
  setVehicles: (list) =>
    set((s) => {
      const active = list.find((v) => v.id === s.activeVehicleId) ?? list[0] ?? null;
      return {
        vehicles: list,
        activeVehicleId: active?.id ?? null,
        vehicle: active,
      };
    }),

  // Favorites
  favorites: [],
  addFavorite: (fav) =>
    set((s) => {
      if (s.favorites.some((f) => f.stationId === fav.stationId)) return s;
      return { favorites: [...s.favorites, fav] };
    }),
  removeFavorite: (stationId) =>
    set((s) => ({
      favorites: s.favorites.filter((f) => f.stationId !== stationId),
    })),
  isFavorite: (stationId) =>
    get().favorites.some((f) => f.stationId === stationId),

  // Settings
  settings: DEFAULT_SETTINGS,
  activeMemberships: [],
  toggleMembership: (id) =>
    set((s) => ({
      activeMemberships: s.activeMemberships.includes(id)
        ? s.activeMemberships.filter((x) => x !== id)
        : [...s.activeMemberships, id],
    })),
  setActiveMemberships: (ids) => set({ activeMemberships: [...new Set(ids)] }),
  updateSettings: (partial) =>
    set((s) => ({ settings: { ...s.settings, ...partial } })),
  setTheme: (theme) =>
    set((s) => ({ settings: { ...s.settings, theme } })),
  setLocale: (locale) =>
    set((s) => ({ settings: { ...s.settings, locale } })),

  // Map search
  mapCenter: null,
  mapRadiusKm: 5,
  setMapCenter: (center) => set({ mapCenter: isFiniteCoordinate(center) ? center : null }),
  setMapRadiusKm: (radius) => set({ mapRadiusKm: Number.isFinite(radius) ? Math.max(radius, 1) : 5 }),
  setMapView: (center, radiusKm) => set({
    mapCenter: isFiniteCoordinate(center) ? center : null,
    mapRadiusKm: Number.isFinite(radiusKm) ? Math.max(radiusKm, 1) : 5,
  }),

  // UI
  selectedStationId: null,
  isMapView: true,
  isFilterOpen: false,
  isVehicleFormOpen: false,
  onboardingDone: false,
  selectStation: (id) => set({ selectedStationId: id }),
  toggleView: () => set((s) => ({ isMapView: !s.isMapView })),
  setFilterOpen: (open) => set({ isFilterOpen: open }),
  setVehicleFormOpen: (open) => set({ isVehicleFormOpen: open }),
  setOnboardingDone: (done) => set({ onboardingDone: done }),

  // Route
  activeRoute: null,
  routeTarget: null,
  routeLoading: false,
  setActiveRoute: (route, target) => set({
    activeRoute: route,
    routeTarget: target,
    routeLoading: false,
    currentStepIndex: 0,
    remainingDistance: route?.distanceMeters ?? 0,
    remainingDuration: route?.durationSeconds ?? 0,
  }),
  setRouteLoading: (loading) => set({ routeLoading: loading }),
  clearRoute: () => set({ activeRoute: null, routeTarget: null, selectedStationId: null, routeLoading: false, isNavigating: false }),

  // Navigation
  isNavigating: false,
  currentStepIndex: 0,
  navPosition: null,
  navHeading: 0,
  remainingDistance: 0,
  remainingDuration: 0,
  startNavigation: () => {
    const state = get();
    if (!state.activeRoute || state.activeRoute.steps.length === 0 || !state.routeTarget) {
      return;
    }

    set({
      isNavigating: true,
      currentStepIndex: 0,
      remainingDistance: state.activeRoute.distanceMeters,
      remainingDuration: state.activeRoute.durationSeconds,
    });
  },
  stopNavigation: () => set({ isNavigating: false, currentStepIndex: 0, navPosition: null, navHeading: 0 }),
  updateNavPosition: (pos, heading) => set({ navPosition: pos, navHeading: heading }),
  advanceStep: () => set((s) => ({
    currentStepIndex: s.activeRoute
      ? Math.min(s.currentStepIndex + 1, Math.max(s.activeRoute.steps.length - 1, 0))
      : s.currentStepIndex,
  })),
  setRemainingRoute: (distance, duration) => set({
    remainingDistance: Math.max(0, Number.isFinite(distance) ? distance : 0),
    remainingDuration: Math.max(0, Number.isFinite(duration) ? duration : 0),
  }),

  // Price Alerts
  priceAlerts: [],
  addPriceAlert: (alert) => set((s) => ({
    priceAlerts: dedupeById([
      ...s.priceAlerts.filter(
        (existing) => !(existing.fuelType === alert.fuelType && existing.targetPrice === alert.targetPrice),
      ),
      alert,
    ]),
  })),
  removePriceAlert: (id) => set((s) => ({ priceAlerts: s.priceAlerts.filter((a) => a.id !== id) })),
  togglePriceAlert: (id) =>
    set((s) => ({
      priceAlerts: s.priceAlerts.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)),
    })),
  setPriceAlerts: (alerts) => set({ priceAlerts: alerts }),

  // Fuel Log
  fuelLog: [],
  addFuelLogEntry: (entry) => set((s) => ({
    fuelLog: dedupeById([
      entry,
      ...s.fuelLog,
    ]),
  })),
  removeFuelLogEntry: (id) => set((s) => ({ fuelLog: s.fuelLog.filter((e) => e.id !== id) })),
  setFuelLog: (log) => set({ fuelLog: log }),

  // Saved Locations
  savedLocations: [],
  addSavedLocation: (loc) => set((s) => ({
    savedLocations: isFiniteCoordinate({ lat: loc.lat, lng: loc.lng })
      ? dedupeById([
          ...s.savedLocations.filter((existing) => existing.name !== loc.name),
          loc,
        ])
      : s.savedLocations,
  })),
  removeSavedLocation: (id) => set((s) => ({ savedLocations: s.savedLocations.filter((l) => l.id !== id) })),
  setSavedLocations: (locs) => set({ savedLocations: locs }),

  // Push Notification Preferences
  priceAlertEnabled: false,
  priceAlertThreshold: { diesel: null, e5: null, e10: null },
  notificationPermission: null,
  setPriceAlertEnabled: (enabled) => set({ priceAlertEnabled: enabled }),
  setPriceAlertThreshold: (fuelType, price) =>
    set((s) => ({
      priceAlertThreshold: {
        ...s.priceAlertThreshold,
        [fuelType]: price !== null && Number.isFinite(price) && price > 0 ? price : null,
      },
    })),
  setNotificationPermission: (permission) => set({ notificationPermission: permission }),

  // Extended Filter
  selectedEnergyTypes: ['diesel', 'e5', 'e10'],
  selectedStationTypes: [],
  selectedConnectorTypes: [],
  selectedChargingTypes: [],
  selectedMinPowerKW: null,
  setSelectedEnergyTypes: (types) => set({ selectedEnergyTypes: types }),
  setSelectedStationTypes: (types) => set({ selectedStationTypes: types }),
  setSelectedConnectorTypes: (types) => set({ selectedConnectorTypes: types }),
  setSelectedChargingTypes: (types) => set({ selectedChargingTypes: types }),
  setSelectedMinPowerKW: (kw) => set({ selectedMinPowerKW: kw }),

  // Compare
  compareStationIds: [],
  toggleCompareStation: (id) =>
    set((s) => ({
      compareStationIds: s.compareStationIds.includes(id)
        ? s.compareStationIds.filter((i) => i !== id)
        : s.compareStationIds.length < MAX_COMPARE_STATIONS
          ? [...s.compareStationIds, id]
          : s.compareStationIds,
    })),
  clearCompare: () => set({ compareStationIds: [] }),

  // Search History
  searchHistory: [],
  addSearchHistory: (entry) =>
    set((s) => {
      // Dedupe strategy:
      //   1. Round each coord to 3 decimals (~110 m bucket) so
      //      Nominatim's slightly-different lat/lng on repeat
      //      lookups don't create visual duplicates.
      //   2. Compare labels case-insensitively after trimming so
      //      "Marburg" / " marburg " collapse into one.
      // An entry is "the same" if EITHER bucket-coords OR
      // normalised-label match the new entry.
      const round = (n: number) => Math.round(n * 1000) / 1000;
      const norm = (s: string) => s.trim().toLowerCase();
      const newBucket = `${round(entry.lat)},${round(entry.lng)}`;
      const newLabel = norm(entry.label);

      return {
        searchHistory: [
          entry,
          ...s.searchHistory.filter((h) => {
            const sameBucket = `${round(h.lat)},${round(h.lng)}` === newBucket;
            const sameLabel = norm(h.label) === newLabel;
            return !(sameBucket || sameLabel);
          }),
        ]
          .filter(
            (item) =>
              Number.isFinite(item.lat) &&
              Number.isFinite(item.lng) &&
              item.label.trim().length > 0,
          )
          .slice(0, MAX_SEARCH_HISTORY),
      };
    }),
  clearSearchHistory: () => set({ searchHistory: [] }),

  // Price History
  priceHistory: [],
  addPriceSnapshot: (snap) =>
    set((s) => ({
      priceHistory: Number.isFinite(snap.price)
        ? [...s.priceHistory, snap].slice(-MAX_PRICE_HISTORY)
        : s.priceHistory,
    })),
  clearPriceHistory: () => set({ priceHistory: [] }),

  // Geo-fenced alerts
  geoFences: [],
  addGeoFence: (fence) =>
    set((s) => ({
      geoFences: [
        fence,
        ...s.geoFences.filter((f) => f.id !== fence.id),
      ],
    })),
  updateGeoFence: (id, partial) =>
    set((s) => ({
      geoFences: s.geoFences.map((f) => (f.id === id ? { ...f, ...partial } : f)),
    })),
  removeGeoFence: (id) =>
    set((s) => ({ geoFences: s.geoFences.filter((f) => f.id !== id) })),
  setGeoFenceEnabled: (id, enabled) =>
    set((s) => ({
      geoFences: s.geoFences.map((f) => (f.id === id ? { ...f, enabled } : f)),
    })),
}));
