// ============================================================
// NavigationView — Full-screen turn-by-turn navigation
// Google Maps style: top bar with next turn, map, bottom bar
// with ETA/distance, and step list.
// ============================================================

'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import { useAppStore } from '@/lib/store/app-store';
import { ManeuverIcon } from './ManeuverIcon';
import type { RouteStep, Coordinates } from '@tankpilot/core';

import 'leaflet/dist/leaflet.css';

// ─── Tile Layer ─────────────────────────────────────────────

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// ─── Helpers ────────────────────────────────────────────────

function formatMeters(m: number): string {
  if (m < 1000) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatDurationNav(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '<1 Min';
  if (mins < 60) return `${mins} Min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} Std ${m} Min`;
}

function getETA(seconds: number): string {
  const now = new Date();
  now.setSeconds(now.getSeconds() + seconds);
  return now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/** Distance between two coordinates in meters */
function distanceBetween(a: Coordinates, b: Coordinates): number {
  const R = 6371e3;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLng * sinLng;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ─── Navigation Arrow Marker ────────────────────────────────

function createNavArrowIcon(heading: number): L.DivIcon {
  return L.divIcon({
    className: 'tp-nav-arrow',
    html: `
      <div style="
        width: 44px; height: 44px;
        position: relative;
      ">
        <div style="
          position: absolute; inset: -12px;
          background: rgba(37,117,234,0.08);
          border-radius: 50%;
          animation: tp-pulse 2.5s ease-out infinite;
        "></div>
        <div style="
          position: absolute; inset: 0;
          background: #2575EA;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 3px 12px rgba(37,117,234,0.5);
          display: flex; align-items: center; justify-content: center;
        ">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style="transform: rotate(${heading}deg);">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

// ─── Destination Marker ─────────────────────────────────────

function createDestinationIcon(): L.DivIcon {
  return L.divIcon({
    className: 'tp-dest-marker',
    html: `
      <div style="
        width: 32px; height: 32px;
        background: #EF4444;
        border: 3px solid white;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: 0 3px 10px rgba(239,68,68,0.4);
        display: flex; align-items: center; justify-content: center;
      ">
        <div style="
          width: 8px; height: 8px;
          background: white;
          border-radius: 50%;
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

// ─── Map Controller ─────────────────────────────────────────

function NavMapController({ position, heading }: { position: Coordinates | null; heading: number }) {
  const map = useMap();

  useEffect(() => {
    if (!position) return;
    map.setView([position.lat, position.lng], 17, { animate: true, duration: 0.5 });
  }, [map, position, heading]);

  return null;
}

// ─── GPS Tracker Hook ───────────────────────────────────────

function useNavigationGPS() {
  const isNavigating = useAppStore((s) => s.isNavigating);
  const activeRoute = useAppStore((s) => s.activeRoute);
  const currentStepIndex = useAppStore((s) => s.currentStepIndex);
  const updateNavPosition = useAppStore((s) => s.updateNavPosition);
  const advanceStep = useAppStore((s) => s.advanceStep);
  const setRemainingRoute = useAppStore((s) => s.setRemainingRoute);
  const stopNavigation = useAppStore((s) => s.stopNavigation);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isNavigating || !activeRoute) return;

    const handlePosition = (pos: GeolocationPosition) => {
      const current: Coordinates = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      const heading = pos.coords.heading ?? 0;
      updateNavPosition(current, heading);

      // Check if we need to advance to next step
      const steps = activeRoute.steps;
      if (currentStepIndex < steps.length - 1) {
        const nextStep = steps[currentStepIndex + 1]!;
        const distToNext = distanceBetween(current, nextStep.maneuver.location);
        if (distToNext < 30) { // within 30m of next maneuver
          advanceStep();
        }
      }

      // Check if arrived (within 50m of last step)
      const lastStep = steps[steps.length - 1];
      if (lastStep) {
        const distToEnd = distanceBetween(current, lastStep.maneuver.location);
        if (distToEnd < 50) {
          stopNavigation();
          return;
        }
      }

      // Calculate remaining distance and duration
      let remainDist = 0;
      let remainDur = 0;
      for (let i = currentStepIndex; i < steps.length; i++) {
        remainDist += steps[i]!.distance;
        remainDur += steps[i]!.duration;
      }
      setRemainingRoute(remainDist, remainDur);
    };

    watchRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      () => { /* silently ignore errors during nav */ },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 },
    );

    return () => {
      if (watchRef.current != null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [isNavigating, activeRoute, currentStepIndex, updateNavPosition, advanceStep, setRemainingRoute, stopNavigation]);
}

// ─── Simulated GPS (for demo/desktop) ──────────────────────

function useSimulatedGPS() {
  const isNavigating = useAppStore((s) => s.isNavigating);
  const activeRoute = useAppStore((s) => s.activeRoute);
  const updateNavPosition = useAppStore((s) => s.updateNavPosition);
  const advanceStep = useAppStore((s) => s.advanceStep);
  const setRemainingRoute = useAppStore((s) => s.setRemainingRoute);
  const stopNavigation = useAppStore((s) => s.stopNavigation);
  const indexRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isNavigating || !activeRoute || activeRoute.coordinates.length < 2) return;

    indexRef.current = 0;
    const coords = activeRoute.coordinates;
    const steps = activeRoute.steps;

    intervalRef.current = setInterval(() => {
      if (indexRef.current >= coords.length - 1) {
        stopNavigation();
        return;
      }

      const [lat, lng] = coords[indexRef.current]!;
      const current: Coordinates = { lat, lng };

      // Calculate bearing to next point
      const nextIdx = Math.min(indexRef.current + 1, coords.length - 1);
      const [nextLat, nextLng] = coords[nextIdx]!;
      const dLng = ((nextLng - lng) * Math.PI) / 180;
      const y = Math.sin(dLng) * Math.cos((nextLat * Math.PI) / 180);
      const x = Math.cos((lat * Math.PI) / 180) * Math.sin((nextLat * Math.PI) / 180) -
        Math.sin((lat * Math.PI) / 180) * Math.cos((nextLat * Math.PI) / 180) * Math.cos(dLng);
      const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;

      updateNavPosition(current, bearing);

      // Check step advancement
      const curStep = useAppStore.getState().currentStepIndex;
      if (curStep < steps.length - 1) {
        const nextStep = steps[curStep + 1]!;
        const dist = distanceBetween(current, nextStep.maneuver.location);
        if (dist < 40) advanceStep();
      }

      // Remaining distance estimate
      const fraction = indexRef.current / coords.length;
      const remainDist = activeRoute.distanceMeters * (1 - fraction);
      const remainDur = activeRoute.durationSeconds * (1 - fraction);
      setRemainingRoute(remainDist, remainDur);

      // Advance along route (skip 3 points for speed)
      indexRef.current += 3;
    }, 500);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isNavigating, activeRoute, updateNavPosition, advanceStep, setRemainingRoute, stopNavigation]);
}

// ─── Step List Panel ────────────────────────────────────────

function StepList({ steps, currentIndex }: { steps: readonly RouteStep[]; currentIndex: number }) {
  const [expanded, setExpanded] = useState(false);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full text-center py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
      >
        Alle Schritte anzeigen ({steps.length})
      </button>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto border-t border-gray-100 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setExpanded(false)}
        className="sticky top-0 w-full text-center py-2 text-xs text-gray-400 bg-white dark:bg-gray-900 z-10"
      >
        Schritte ausblenden
      </button>
      {steps.map((step, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-50 dark:border-gray-800
            ${i === currentIndex ? 'bg-brand-50 dark:bg-brand-900/20' : ''}
            ${i < currentIndex ? 'opacity-40' : ''}`}
        >
          <ManeuverIcon type={step.maneuver.type} className="w-5 h-5 text-gray-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{step.instruction}</p>
            {step.name && (
              <p className="text-xs text-gray-400 truncate">{step.name}</p>
            )}
          </div>
          <span className="text-xs text-gray-400 flex-shrink-0">{formatMeters(step.distance)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export function NavigationView() {
  const activeRoute = useAppStore((s) => s.activeRoute);
  const routeTarget = useAppStore((s) => s.routeTarget);
  const isNavigating = useAppStore((s) => s.isNavigating);
  const currentStepIndex = useAppStore((s) => s.currentStepIndex);
  const navPosition = useAppStore((s) => s.navPosition);
  const navHeading = useAppStore((s) => s.navHeading);
  const remainingDistance = useAppStore((s) => s.remainingDistance);
  const remainingDuration = useAppStore((s) => s.remainingDuration);
  const stopNavigation = useAppStore((s) => s.stopNavigation);
  const clearRoute = useAppStore((s) => s.clearRoute);

  // Use simulated GPS for desktop demo, real GPS when available
  useSimulatedGPS();
  useNavigationGPS();

  const navArrowIcon = useMemo(
    () => createNavArrowIcon(navHeading),
    [navHeading],
  );
  const destIcon = useMemo(() => createDestinationIcon(), []);

  if (!activeRoute || !routeTarget || !isNavigating) return null;

  const steps = activeRoute.steps;
  if (steps.length === 0) return null;
  const currentStep = steps[currentStepIndex] ?? steps[steps.length - 1];
  const nextStep = steps[currentStepIndex + 1] ?? null;
  const firstCoordinate = activeRoute.coordinates[0];
  if (!currentStep || !firstCoordinate) return null;

  const handleStop = () => {
    stopNavigation();
    clearRoute();
  };

  // Position for map center — use navPosition if available, else route start
  const mapCenter = navPosition ?? {
    lat: firstCoordinate[0],
    lng: firstCoordinate[1],
  };

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-gray-900">
      {/* ─── Top: Current Maneuver ─── */}
      <div className="bg-brand-600 text-white px-4 py-3 safe-top shadow-lg z-10">
        <div className="flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-2.5 flex-shrink-0">
            <ManeuverIcon type={currentStep.maneuver.type} className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold truncate">{currentStep.instruction}</p>
            <p className="text-sm text-white/70">
              {formatMeters(currentStep.distance)}
              {currentStep.name ? ` — ${currentStep.name}` : ''}
            </p>
          </div>
        </div>

        {/* Next step preview */}
        {nextStep && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/15">
            <ManeuverIcon type={nextStep.maneuver.type} className="w-4 h-4 text-white/60 flex-shrink-0" />
            <p className="text-xs text-white/60 truncate">
              Danach: {nextStep.instruction}
            </p>
          </div>
        )}
      </div>

      {/* ─── Map ─── */}
      <div className="flex-1 relative">
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={17}
          className="w-full h-full"
          zoomControl={false}
          attributionControl={false}
        >
          <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
          <NavMapController position={navPosition} heading={navHeading} />

          {/* Route polyline */}
          <Polyline
            positions={activeRoute.coordinates as [number, number][]}
            pathOptions={{
              color: '#2575EA',
              weight: 6,
              opacity: 0.9,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />

          {/* Remaining route highlight */}
          {currentStepIndex > 0 && (
            <Polyline
              positions={activeRoute.coordinates.slice(0, Math.floor(activeRoute.coordinates.length * (currentStepIndex / steps.length))) as [number, number][]}
              pathOptions={{
                color: '#94a3b8',
                weight: 6,
                opacity: 0.5,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          )}

          {/* Navigation arrow */}
          {navPosition && (
            <Marker
              position={[navPosition.lat, navPosition.lng]}
              icon={navArrowIcon}
              interactive={false}
            />
          )}

          {/* Destination marker */}
          <Marker
            position={[routeTarget.lat, routeTarget.lng]}
            icon={destIcon}
            interactive={false}
          />
        </MapContainer>
      </div>

      {/* ─── Bottom Bar: ETA + Controls ─── */}
      <div className="bg-white dark:bg-gray-900 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] z-10">
        {/* Route summary */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {formatDurationNav(remainingDuration || activeRoute.durationSeconds)}
            </p>
            <p className="text-sm text-gray-500">
              {formatMeters(remainingDistance || activeRoute.distanceMeters)}
              {' · '}
              Ankunft {getETA(remainingDuration || activeRoute.durationSeconds)}
            </p>
          </div>

          <div className="flex items-center gap-3 text-right">
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {routeTarget.brand || routeTarget.name}
              </p>
              <p className="text-xs text-gray-400">{routeTarget.street}</p>
            </div>
          </div>
        </div>

        {/* Step list */}
        <StepList steps={steps} currentIndex={currentStepIndex} />

        {/* Stop button */}
        <div className="px-4 py-3 safe-bottom">
          <button
            type="button"
            onClick={handleStop}
            className="w-full py-3 bg-red-500 text-white font-semibold text-sm rounded-xl
                       hover:bg-red-600 active:bg-red-700 transition-colors shadow-sm
                       flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            Navigation beenden
          </button>
        </div>
      </div>
    </div>
  );
}
