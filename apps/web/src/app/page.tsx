// ============================================================
// Home Page — Modern split-view: glass-morphic side panel,
// floating list items over an immersive map. Gradient mesh
// behind everything, sticky controls, mobile bottom-nav.
// ============================================================

'use client';

import dynamic from 'next/dynamic';
import { useAppStore } from '@/lib/store/app-store';
import { useUnifiedStations } from '@/lib/hooks/use-unified-stations';
import { useGeolocation, useLiveLocation } from '@/lib/hooks/use-location';
import { useRecommendations } from '@/lib/hooks/use-recommendations';
import { AppShell } from '@/components/layout/AppShell';
import { BottomNav } from '@/components/layout/BottomNav';
import { HeroEmptyState } from '@/components/layout/HeroEmptyState';
import { StationList } from '@/components/stations/StationList';
import { StationPanel } from '@/components/stations/StationPanel';
import { SortBar } from '@/components/stations/SortBar';
import { BrandQuickFilter } from '@/components/stations/BrandQuickFilter';
import { FilterPanel } from '@/components/stations/FilterPanel';
import { PriceStats } from '@/components/stations/PriceStats';
import { SearchHistory } from '@/components/stations/SearchHistory';
import { AddressSearch } from '@/components/stations/AddressSearch';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';
import { FuelAdvisor } from '@/components/intelligence/FuelAdvisor';
import { SavingsCalculator } from '@/components/intelligence/SavingsCalculator';
import { BestDealCard } from '@/components/intelligence/BestDealCard';
import { PricePredictionCard } from '@/components/intelligence/PricePredictionCard';
import { SmartBuyingScoreCard } from '@/components/intelligence/SmartBuyingScoreCard';
import { fetchJson } from '@/lib/http/fetch-json';
import { fetchRoute, isFuelStation, isChargingStation } from '@fuelyn/core';
import type {
  Station,
  UnifiedStation,
  UnifiedFuelStation,
  ChargingStation as CoreChargingStation,
} from '@fuelyn/core';
import { useCallback, useEffect, useMemo } from 'react';

// Leaflet requires browser APIs — load dynamically with no SSR
const StationMap = dynamic(
  () => import('@/components/map/StationMap').then((mod) => ({ default: mod.StationMap })),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center fy-mesh">
        <div className="flex items-center gap-3 px-5 py-3 rounded-[var(--radius-pill)] fy-glass shadow-[var(--shadow-md)]">
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
    readonly road?: string;
    readonly house_number?: string;
    readonly postcode?: string;
    readonly suburb?: string;
    readonly city?: string;
    readonly town?: string;
    readonly village?: string;
    readonly municipality?: string;
  };
  readonly display_name?: string;
}

/**
 * Build the label that lands in the "Letzte Suchen" pill.
 *
 * Goal: every entry should be visually distinguishable from the
 * others, so two pins inside Marburg never collapse to two
 * identical "Marburg" pills.
 *
 * Priority order (best → degraded):
 *   1. road [house_number], postcode city  — full street address
 *   2. road, postcode city                  — no house number
 *   3. road, city                           — no PLZ
 *   4. road                                 — pin in the middle of nowhere
 *   5. postcode city                        — building data not available
 *   6. suburb, city                         — pin in a park / unnamed road
 *   7. city                                 — only the city name resolved
 *   8. fallbackLabel (lat, lng)             — Nominatim returned nothing
 *
 * Exported only so tests can hammer all the partial-shape paths.
 */
export function composeHistoryLabel(
  data: ReverseGeocodeResponse,
  fallbackLabel: string,
): string {
  const a = data.address ?? {};
  const cityLike = a.city ?? a.town ?? a.village ?? a.municipality ?? '';
  const street = a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}` : '';
  // Only treat as "postcode + city" when BOTH fields are present —
  // otherwise we'd shortcut a bare city before having a chance to
  // surface a richer suburb-or-display_name fallback.
  const postcodeCity = a.postcode && cityLike ? `${a.postcode} ${cityLike}` : '';

  if (street && postcodeCity) return `${street}, ${postcodeCity}`;
  if (street && cityLike) return `${street}, ${cityLike}`;
  if (street) return street;
  if (postcodeCity) return postcodeCity;
  if (a.suburb && cityLike) return `${a.suburb}, ${cityLike}`;
  if (cityLike) return cityLike;
  return data.display_name?.split(',').slice(0, 3).map((s) => s.trim()).filter(Boolean).join(', ')
    || fallbackLabel;
}

export default function HomePage() {
  const { userLocation, permission, requestLocation, insecureContext } = useGeolocation();
  // Live GPS tracking — gated by the user's settings preference so
  // battery use is deliberate. Plus the usual safety guards:
  //   - permission must be granted (no point watching without it)
  //   - context must be secure (insecure HTTP can't access GPS)
  // The hook is otherwise free to no-op when its conditions don't
  // hold, so wrapping in a single `enabled` is sufficient.
  const liveLocationEnabled = useAppStore((s) => s.settings.liveLocationEnabled);
  useLiveLocation({
    enabled: liveLocationEnabled && permission === 'granted' && !insecureContext,
  });
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

  // Per-mode hit counts for the SortBar pills. Cheap to compute
  // (single pass over the recommendations array) and gives users
  // a glanceable answer to "is the Geöffnet tab worth a click?"
  // Memoised because the array reference changes on every store
  // update and counts are O(n).
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const sortCounts = useMemo(() => {
    const total = recommendations.length;
    const withPrice = recommendations.filter(
      (r) => typeof r.station.prices?.[fuelType] === 'number',
    ).length;
    const open = recommendations.filter((r) => r.station.isOpen).length;
    return {
      recommended: total,
      cheapest: withPrice,
      nearest: total,
      open,
    };
  }, [recommendations, fuelType]);

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

  // Reverse-geocode for search history.
  //
  // We ask Nominatim for `addressdetails=1` at building-level zoom
  // (18) so we get road + house_number + postcode whenever the
  // location is precise enough. The label that lands in the
  // "letzte suchen" pill therefore distinguishes addresses within
  // the same city ("Hauptstraße 12, 35037 Marburg" vs.
  // "Bahnhofstraße 5, 35037 Marburg") instead of collapsing them
  // both to a generic "Marburg".
  useEffect(() => {
    if (!userLocation) return;
    const { lat, lng } = userLocation;
    const fallbackLabel = `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    const controller = new AbortController();
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'json',
      addressdetails: '1',
      zoom: '18',
      'accept-language': 'de',
    });
    fetchJson<ReverseGeocodeResponse>(
      `https://nominatim.openstreetmap.org/reverse?${params}`,
      { signal: controller.signal, timeoutMs: 8000 },
    )
      .then((data) => {
        useAppStore.getState().addSearchHistory({
          lat,
          lng,
          label: composeHistoryLabel(data, fallbackLabel),
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
                <StationPanel recommendations={recommendations} />
              </div>

              {/* Side panel — modern glass surface */}
              <aside
                className={[
                  isMapView ? 'hidden lg:flex' : 'flex',
                  'flex-col w-full lg:w-[420px] xl:w-[460px]',
                  'border-l border-[var(--color-border-subtle)]',
                  'bg-[var(--color-bg)]/85 backdrop-blur-md',
                  // `scrollbar-thin` (vs the previous `scrollbar-hide`)
                  // gives users a visible affordance that more content
                  // sits below the fold — without this they were seeing
                  // "18 Tankstellen gefunden" but only the top two cards
                  // and assumed the rest were missing.
                  'overflow-y-auto scrollbar-thin',
                ].join(' ')}
              >
                <div className="sticky top-0 z-10 bg-[var(--color-bg)]/85 backdrop-blur-md border-b border-[var(--color-border-subtle)]">
                  <SortBar counts={sortCounts} />
                  {/*
                    Brand quick-pick chips — only renders when there
                    are brands present in the candidate set, so it
                    self-suppresses for empty results without an
                    explicit conditional here.
                  */}
                  <BrandQuickFilter recommendations={recommendations} />
                  <div className="px-4 pt-3 pb-3">
                    <AddressSearch />
                  </div>
                </div>
                <SearchHistory />
                <BestDealCard recommendations={recommendations} />
                <SmartBuyingScoreCard />
                <PricePredictionCard />
                <PriceStats recommendations={recommendations} />

                {/*
                  Order rationale: the user's primary task is "find a
                  cheap station nearby". So the StationList comes
                  immediately after the price-summary widgets and
                  BEFORE the AI advisor / savings calculator (which
                  are deeper-context tools that get scrolled to). On
                  narrow viewports the list was previously buried
                  below the advisor card and the user had to scroll
                  one screen-height to reach the first station entry.
                */}
                <StationList
                  recommendations={recommendations}
                  isLoading={isLoading}
                  isError={isError}
                  onStationClick={handleStationClick}
                  onRetry={() => void refetch()}
                />

                {recommendations.length > 0 && (
                  <div className="px-4 space-y-3 pb-2 fy-enter">
                    <FuelAdvisor />
                    <SavingsCalculator recommendations={recommendations} />
                  </div>
                )}
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
    <div className="flex-shrink-0 px-4 py-2 fy-glass-subtle border-b border-[var(--color-border-subtle)]">
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
