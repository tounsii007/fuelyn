// ============================================================
// Home Page — Modern split-view: glass-morphic side panel,
// floating list items over an immersive map. Gradient mesh
// behind everything, sticky controls, mobile bottom-nav.
// ============================================================

'use client';

import dynamic from 'next/dynamic';
import { useAppStore } from '@/lib/store/app-store';
import { useUnifiedStations } from '@/lib/hooks/use-unified-stations';
import { useGeolocation } from '@/lib/hooks/use-location';
import { useRecommendations } from '@/lib/hooks/use-recommendations';
import { AppShell } from '@/components/layout/AppShell';
import { BottomNav } from '@/components/layout/BottomNav';
import { HeroEmptyState } from '@/components/layout/HeroEmptyState';
import { StationList } from '@/components/stations/StationList';
import { StationPanel } from '@/components/stations/StationPanel';
import { SortBar } from '@/components/stations/SortBar';
import { FilterPanel } from '@/components/stations/FilterPanel';
import { PriceStats } from '@/components/stations/PriceStats';
import { SearchHistory } from '@/components/stations/SearchHistory';
import { AddressSearch } from '@/components/stations/AddressSearch';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { FuelAdvisor } from '@/components/intelligence/FuelAdvisor';
import { SavingsCalculator } from '@/components/intelligence/SavingsCalculator';
import { fetchJson } from '@/lib/http/fetch-json';
import { fetchRoute, isFuelStation, isChargingStation } from '@tankpilot/core';
import type {
  Station,
  UnifiedStation,
  UnifiedFuelStation,
  ChargingStation as CoreChargingStation,
} from '@tankpilot/core';
import { useCallback, useEffect, useMemo } from 'react';

// Leaflet requires browser APIs — load dynamically with no SSR
const StationMap = dynamic(
  () => import('@/components/map/StationMap').then((mod) => ({ default: mod.StationMap })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center tp-mesh">
        <div className="flex items-center gap-3 px-5 py-3 rounded-[var(--radius-pill)] tp-glass shadow-[var(--shadow-md)]">
          <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-brand-500)] animate-pulse" />
          <span className="text-sm text-[var(--color-fg-muted)]">Karte wird geladen…</span>
        </div>
      </div>
    ),
  },
);

const NavigationView = dynamic(
  () => import('@/components/navigation/NavigationView').then((mod) => ({ default: mod.NavigationView })),
  { ssr: false },
);

interface ReverseGeocodeResponse {
  readonly address?: {
    readonly city?: string;
    readonly town?: string;
    readonly village?: string;
    readonly municipality?: string;
  };
  readonly display_name?: string;
}

export default function HomePage() {
  const { userLocation, permission, requestLocation, insecureContext } = useGeolocation();
  const isMapView = useAppStore((s) => s.isMapView);
  const filter = useAppStore((s) => s.filter);
  const selectStation = useAppStore((s) => s.selectStation);
  const setActiveRoute = useAppStore((s) => s.setActiveRoute);
  const setRouteLoading = useAppStore((s) => s.setRouteLoading);
  const isNavigating = useAppStore((s) => s.isNavigating);
  const mapCenter = useAppStore((s) => s.mapCenter);
  const mapRadiusKm = useAppStore((s) => s.mapRadiusKm);
  const setMapView = useAppStore((s) => s.setMapView);

  const searchLat = mapCenter?.lat ?? userLocation?.lat ?? null;
  const searchLng = mapCenter?.lng ?? userLocation?.lng ?? null;
  const searchRadius = mapCenter ? mapRadiusKm : filter.radiusKm;

  const vehicle = useAppStore((s) => s.vehicle);
  const driveType = vehicle?.driveType ?? 'benzin';
  const showCharging = driveType === 'hybrid' || driveType === 'elektro';
  const selectedEnergyTypes = useAppStore((s) => s.selectedEnergyTypes);

  const {
    data: unifiedStations,
    isLoading,
    isError,
    refetch,
  } = useUnifiedStations({
    lat: searchLat,
    lng: searchLng,
    radiusKm: searchRadius,
    energyTypes: selectedEnergyTypes,
    sort: 'dist',
    enabled: searchLat != null && searchLng != null,
  });

  const fuelStations: Station[] = useMemo(() => {
    if (!unifiedStations) return [];
    return unifiedStations.filter(isFuelStation).map((u: UnifiedFuelStation): Station => {
      const raw = u as unknown as Record<string, unknown>;
      const addr = u.address ?? ({} as Record<string, string>);
      const prices =
        u.prices ?? {
          diesel: (raw.diesel as number) ?? null,
          e5: (raw.e5 as number) ?? null,
          e10: (raw.e10 as number) ?? null,
        };
      return {
        id: u.id,
        name: u.name,
        brand: u.brand,
        street: addr.street ?? (raw.street as string) ?? '',
        houseNumber: addr.houseNumber ?? (raw.houseNumber as string) ?? '',
        postCode: addr.postCode ?? (raw.postCode as string) ?? '',
        place: addr.city ?? (raw.city as string) ?? (raw.place as string) ?? '',
        lat: u.lat,
        lng: u.lng,
        dist: u.dist,
        prices,
        isOpen: u.isOpen,
      };
    });
  }, [unifiedStations]);

  const chargingStations: CoreChargingStation[] = useMemo(() => {
    if (!unifiedStations) return [];
    return unifiedStations.filter(isChargingStation).map((u): CoreChargingStation => {
      const raw = u as unknown as Record<string, unknown>;
      const addr = u.address ?? ({} as Record<string, string>);
      const street = addr.street ?? (raw.street as string) ?? '';
      const houseNumber = addr.houseNumber ?? (raw.houseNumber as string) ?? '';
      return {
        id: u.id,
        name: u.name,
        operator: u.operator,
        lat: u.lat,
        lng: u.lng,
        dist: u.dist,
        address: `${street} ${houseNumber}`.trim(),
        city: addr.city ?? (raw.city as string) ?? '',
        postCode: addr.postCode ?? (raw.postCode as string) ?? '',
        connections: (u.connections ?? []).map((c) => ({
          type: c.connectorLabel ?? c.connectorType ?? 'Unbekannt',
          powerKW: c.powerKW,
          quantity: c.quantity,
        })),
        isOperational: u.isOperational,
        usageCost: u.usageCost,
        accessType: u.accessType,
      };
    });
  }, [unifiedStations]);

  const extraStations: UnifiedStation[] = useMemo(() => {
    if (!unifiedStations) return [];
    return unifiedStations.filter(
      (s) => s.stationType === 'hydrogen' || s.stationType === 'gas',
    );
  }, [unifiedStations]);

  const recommendations = useRecommendations(fuelStations);

  const handleStationClick = useCallback(
    async (stationId: string) => {
      selectStation(stationId);
      const state = useAppStore.getState();
      const rec = recommendations.find((r) => r.station.id === stationId);
      let stationCoords: { lat: number; lng: number } | null = null;
      let legacyStation: Station | null = null;

      if (rec) {
        legacyStation = rec.station;
        stationCoords = { lat: rec.station.lat, lng: rec.station.lng };
      } else {
        const unified = unifiedStations?.find((s) => s.id === stationId);
        if (unified) {
          stationCoords = { lat: unified.lat, lng: unified.lng };
          legacyStation = {
            id: unified.id,
            name: unified.name,
            brand: unified.brand,
            street: unified.address.street,
            houseNumber: unified.address.houseNumber,
            postCode: unified.address.postCode,
            place: unified.address.city,
            lat: unified.lat,
            lng: unified.lng,
            dist: unified.dist,
            prices: { diesel: null, e5: null, e10: null },
            isOpen: unified.isOpen,
          };
        }
      }

      if (!stationCoords || !legacyStation) return;
      if (!state.isMapView) useAppStore.getState().toggleView();

      const loc = state.userLocation;
      if (loc) {
        setRouteLoading(true);
        setActiveRoute(null, legacyStation);
        const route = await fetchRoute(loc, stationCoords);
        setActiveRoute(route, legacyStation);
      } else {
        setActiveRoute(null, legacyStation);
      }
    },
    [recommendations, unifiedStations, selectStation, setActiveRoute, setRouteLoading],
  );

  const handleBoundsChange = useCallback(
    (center: { lat: number; lng: number }, radiusKm: number) => {
      setMapView(center, radiusKm);
    },
    [setMapView],
  );

  const handleReload = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleUseDemoLocation = useCallback(() => {
    useAppStore.getState().setUserLocation({ lat: 52.52, lng: 13.405 });
  }, []);

  // Reverse-geocode for search history
  useEffect(() => {
    if (!userLocation) return;
    const { lat, lng } = userLocation;
    const fallbackLabel = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    const controller = new AbortController();
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'json',
      zoom: '12',
      'accept-language': 'de',
    });
    fetchJson<ReverseGeocodeResponse>(
      `https://nominatim.openstreetmap.org/reverse?${params}`,
      { signal: controller.signal, timeoutMs: 8000 },
    )
      .then((data) => {
        const addr = data?.address;
        const label =
          addr?.city ||
          addr?.town ||
          addr?.village ||
          addr?.municipality ||
          data.display_name?.split(',')[0] ||
          fallbackLabel;
        useAppStore.getState().addSearchHistory({
          lat,
          lng,
          label,
          timestamp: new Date().toISOString(),
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        useAppStore.getState().addSearchHistory({
          lat,
          lng,
          label: fallbackLabel,
          timestamp: new Date().toISOString(),
        });
      });
    return () => controller.abort();
  }, [userLocation]);

  // Record price snapshots
  useEffect(() => {
    if (!recommendations.length) return;
    const fType = useAppStore.getState().filter.fuelType;
    const now = new Date().toISOString();
    for (const rec of recommendations.slice(0, 5)) {
      const price = rec.station.prices?.[fType];
      if (price != null) {
        useAppStore.getState().addPriceSnapshot({
          stationId: rec.station.id,
          fuelType: fType,
          price,
          timestamp: now,
        });
      }
    }
  }, [recommendations]);

  const needsLocation = !userLocation && permission !== 'granted';

  return (
    <>
      {isNavigating && <NavigationView />}
      <FilterPanel />
      <OnboardingModal />

      <AppShell>
        {needsLocation ? (
          <HeroEmptyState
            onRequestLocation={requestLocation}
            onUseDemoLocation={handleUseDemoLocation}
          />
        ) : (
          <>
            {insecureContext && <InsecureContextBanner />}

            <div className="flex h-full">
              {/* Map Panel */}
              <div className={`${isMapView ? 'flex-1' : 'hidden lg:flex lg:flex-1'} relative`}>
                <StationMap
                  recommendations={recommendations}
                  chargingStations={showCharging ? chargingStations : []}
                  extraStations={extraStations}
                  onStationClick={handleStationClick}
                  onBoundsChange={handleBoundsChange}
                  onReload={handleReload}
                  onRequestLocation={requestLocation}
                />
                <StationPanel />
              </div>

              {/* Side panel — modern glass surface */}
              <aside
                className={[
                  isMapView ? 'hidden lg:flex' : 'flex',
                  'flex-col w-full lg:w-[420px] xl:w-[460px]',
                  'border-l border-[var(--color-border-subtle)]',
                  'bg-[var(--color-bg)]/85 backdrop-blur-md',
                  'overflow-y-auto scrollbar-hide',
                ].join(' ')}
              >
                <div className="sticky top-0 z-10 bg-[var(--color-bg)]/85 backdrop-blur-md border-b border-[var(--color-border-subtle)]">
                  <SortBar />
                  <div className="px-4 pt-3 pb-3">
                    <AddressSearch />
                  </div>
                </div>
                <SearchHistory />
                <PriceStats recommendations={recommendations} />

                {recommendations.length > 0 && (
                  <div className="px-4 space-y-3 pb-2 tp-enter">
                    <FuelAdvisor />
                    <SavingsCalculator recommendations={recommendations} />
                  </div>
                )}

                <StationList
                  recommendations={recommendations}
                  isLoading={isLoading}
                  isError={isError}
                  onStationClick={handleStationClick}
                  onRetry={() => void refetch()}
                />
              </aside>
            </div>
          </>
        )}
      </AppShell>

      {/* Mobile floating bottom nav */}
      {!isNavigating && <BottomNav />}
    </>
  );
}

function InsecureContextBanner() {
  return (
    <div className="flex-shrink-0 px-4 py-2 tp-glass-subtle border-b border-[var(--color-border-subtle)]">
      <p className="text-xs text-[var(--color-fg-muted)] text-center">
        <span className="font-semibold text-[var(--color-warning-500)]">
          Demo-Standort (Berlin)
        </span>
        {' — GPS benötigt HTTPS. Für echten Standort über '}
        <code className="bg-[var(--color-bg-subtle)] px-1.5 py-0.5 rounded text-[10px]">
          localhost
        </code>
        {' zugreifen.'}
      </p>
    </div>
  );
}
