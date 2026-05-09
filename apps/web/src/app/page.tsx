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
import { BestDealCard } from '@/components/intelligence/BestDealCard';
import { AIInsightsHero } from '@/components/intelligence/AIInsightsHero';
import { AIAssistant } from '@/components/intelligence/AIAssistant';
import { SmartFilterChips, applySmartChips, type SmartFilterId } from '@/components/stations/SmartFilterChips';
import { fetchJson } from '@/lib/http/fetch-json';
import { fetchRoute, isFuelStation, isChargingStation } from '@fuelyn/core';
import type {
  Station,
  UnifiedStation,
  UnifiedFuelStation,
  ChargingStation as CoreChargingStation,
} from '@fuelyn/core';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  const isMapView = useAppStore((s) => s.isMapView);
  const filter = useAppStore((s) => s.filter);
  const selectStation = useAppStore((s) => s.selectStation);
  const setActiveRoute = useAppStore((s) => s.setActiveRoute);
  const setRouteLoading = useAppStore((s) => s.setRouteLoading);
  const isNavigating = useAppStore((s) => s.isNavigating);
  const mapCenter = useAppStore((s) => s.mapCenter);
  const mapRadiusKm = useAppStore((s) => s.mapRadiusKm);
  const setMapView = useAppStore((s) => s.setMapView);

  /**
   * Phase 6 — Mobile bottom-sheet state.
   *
   * On screens < lg the side-panel is repositioned as a floating
   * bottom drawer over the map with two snap-points:
   *   • peek (default) — ~16 vh, just enough to show the AI verdict
   *     headline + price-stats summary
   *   • full — ~88 vh, full station list + intelligence cards
   *
   * `bottomSheetFull` toggles between them. Drag-to-resize is left
   * for a future iteration; the tap-handle keeps this MVP simple.
   * On desktop (lg+) this state is ignored — the aside renders as
   * the existing fixed-width side rail.
   */
  const [bottomSheetFull, setBottomSheetFull] = useState(false);

  /**
   * Phase 7 — Smart-filter chip state.
   * Multi-select, persisted only for this session; toggling a chip
   * narrows the visible recommendations list without a backend
   * round-trip.
   */
  const [smartFilters, setSmartFilters] = useState<Set<SmartFilterId>>(() => new Set());
  const toggleSmartFilter = useCallback((id: SmartFilterId) => {
    setSmartFilters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const clearSmartFilters = useCallback(() => setSmartFilters(new Set()), []);

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

            <div className="flex h-full min-h-0">
              {/* Map Panel */}
              <div className={`${isMapView ? 'flex-1' : 'hidden lg:flex lg:flex-1'} relative min-h-0`}>
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

              {/* Side panel — modern glass surface
                  Mobile + map view: bottom-sheet (Tesla/Uber style)
                  with peek/full snap-points, sliding height transition.
                  Desktop: fixed-width side rail (unchanged).         */}
              <aside
                className={[
                  isMapView
                    ? 'flex fixed lg:static inset-x-0 bottom-0 z-30 lg:z-auto rounded-t-3xl lg:rounded-none'
                    : 'flex',
                  'flex-col w-full lg:w-[420px] xl:w-[460px]',
                  // Mobile: dynamic height switches between peek / full.
                  // Desktop: full column height as before.
                  isMapView
                    ? bottomSheetFull
                      ? 'h-[88vh] lg:h-full'
                      : 'h-[16vh] lg:h-full'
                    : 'h-full',
                  'min-h-0',
                  'border-t lg:border-t-0 lg:border-l border-[var(--color-border-subtle)]',
                  'bg-[var(--color-bg)]/92 lg:bg-[var(--color-bg)]/85 backdrop-blur-xl',
                  'shadow-[0_-12px_40px_rgba(0,0,0,0.20)] lg:shadow-none',
                  'transition-[height] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                  // Thin custom scrollbar (defined in globals.css) so the
                  // user sees the scroll affordance without it visually
                  // dominating the panel.
                  'overflow-y-auto overscroll-contain fy-scroll-thin',
                ].join(' ')}
              >
                {/* Mobile drag-handle (tap to toggle peek/full).
                    Hidden on lg+ where the aside is a side rail. */}
                {isMapView && (
                  <button
                    type="button"
                    onClick={() => setBottomSheetFull((v) => !v)}
                    aria-label={bottomSheetFull ? 'Bottom-Sheet einklappen' : 'Bottom-Sheet ausklappen'}
                    className="lg:hidden sticky top-0 z-20 w-full flex items-center justify-center
                               py-2 bg-transparent"
                  >
                    <span className="block w-10 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                  </button>
                )}

                <div className="sticky top-0 lg:top-0 z-10 bg-[var(--color-bg)]/85 backdrop-blur-md border-b border-[var(--color-border-subtle)]">
                  <SortBar />
                  <div className="px-4 pt-3 pb-3">
                    <AddressSearch />
                  </div>
                </div>
                <AIInsightsHero recommendations={recommendations} />
                <SearchHistory />
                <BestDealCard recommendations={recommendations} />
                <PriceStats recommendations={recommendations} />

                {/* Phase 7 — Smart filter chip-bar. Sticky to keep the
                    chips visible while the user scrolls the list. */}
                <SmartFilterChips
                  recommendations={recommendations}
                  active={smartFilters}
                  onToggle={toggleSmartFilter}
                  fuelType={filter.fuelType}
                  onClear={clearSmartFilters}
                />

                {/* Station list comes right after the stats so the user sees
                    every nearby station immediately without having to scroll
                    past the AI advisor + savings calculator first. The
                    intelligence section sits below — it's "context" once
                    you've already seen the data. */}
                <StationList
                  recommendations={
                    applySmartChips(recommendations, smartFilters, filter.fuelType) as typeof recommendations
                  }
                  isLoading={isLoading}
                  isError={isError}
                  onStationClick={handleStationClick}
                  onRetry={() => void refetch()}
                />

                {recommendations.length > 0 && (
                  <div className="px-4 space-y-3 pb-2 pt-2 border-t border-[var(--color-border-subtle)] fy-enter">
                    <FuelAdvisor />
                    <SavingsCalculator recommendations={recommendations} />
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
      </AppShell>

      {/* AI Assistant FAB + Drawer — sits above everything,
          available even when the sidebar is collapsed on mobile. */}
      <AIAssistant />

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
