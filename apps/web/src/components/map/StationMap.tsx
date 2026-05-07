// ============================================================
// StationMap - Premium map with custom price markers
// Uses CartoDB Voyager tiles for a clean, modern look and
// custom HTML markers with animated price bubbles.
// ============================================================

'use client';

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import type { MutableRefObject } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import type { StationRecommendation, ChargingStation, UnifiedStation, UnifiedHydrogenStation, UnifiedGasStation } from '@fuelyn/core';
import { formatPrice, FUEL_TYPE_LABELS, isHydrogenStation, isGasStation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { getBrandConfig } from '@/lib/brand-config';
import { getCachedIcon, priceMarkerKey, chargingMarkerKey, h2MarkerKey, gasMarkerKey, clusterMarkerKey } from '@/lib/utils/marker-cache';
import { RouteLayer } from './RouteLayer';

import 'leaflet/dist/leaflet.css';

// ─── Disable Leaflet default icon paths for Next.js ────────
// Next.js bundler breaks Leaflet's default icon URLs, causing
// broken/oversized marker images. Since we only use custom
// divIcons, we disable the defaults entirely.
// @ts-expect-error — Leaflet internal API workaround for bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: '',
  iconRetinaUrl: '',
  shadowUrl: '',
  iconSize: [0, 0],
  shadowSize: [0, 0],
});

const DEFAULT_CENTER: [number, number] = [51.1657, 10.4515];
const DEFAULT_ZOOM = 13;

interface StationMapProps {
  recommendations: StationRecommendation[];
  chargingStations?: ChargingStation[];
  /** H2 and Gas stations from the unified feed. */
  extraStations?: UnifiedStation[];
  onStationClick: (stationId: string) => void;
  onBoundsChange?: (center: { lat: number; lng: number }, radiusKm: number) => void;
  onReload?: () => void;
  onRequestLocation?: () => void;
}

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_DARK_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_TERRAIN_URL = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const TILE_SATELLITE_ATTRIBUTION = '&copy; Esri, Maxar, Earthstar Geographics';
const TILE_TERRAIN_ATTRIBUTION = '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

const MAP_STYLES = [
  { id: 'standard', label: 'Standard', icon: 'S' },
  { id: 'dark', label: 'Dark', icon: 'D' },
  { id: 'satellite', label: 'Satellit', icon: 'Sat' },
  { id: 'terrain', label: 'Gelände', icon: 'Ter' },
] as const;

function isFiniteCoordinate(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 180;
}

function getStarSvg(size: number): string {
  return `<svg viewBox="0 0 20 20" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M10 1.5l2.224 4.507 4.974.723-3.6 3.509.85 4.953L10 13.523l-4.448 2.339.85-4.953-3.6-3.509 4.974-.723L10 1.5z"/></svg>`;
}

function createPriceMarkerIcon(
  price: number | null,
  isBest: boolean,
  isOpen: boolean,
  reachability: 'safe' | 'tight' | 'unreachable',
  brand: string,
): L.DivIcon {
  const priceText = price != null ? formatPrice(price) : 'n/a';
  const brandCfg = getBrandConfig(brand);
  const noPrice = price == null;
  const bgColor = isBest ? '#2575EA' : '#FFFFFF';
  const textColor = isBest ? '#FFFFFF' : noPrice ? '#94A3B8' : '#0F172A';
  const borderColor = isBest
    ? 'transparent'
    : reachability === 'unreachable'
      ? '#FCA5A5'
      : reachability === 'tight'
        ? '#FCD34D'
        : noPrice ? '#E2E8F0' : `${brandCfg.color}40`;
  const opacity = !isOpen ? 0.5 : noPrice ? 0.65 : 1;
  const stemColor = isBest ? '#2575EA' : noPrice ? '#CBD5E1' : brandCfg.color;
  const badgeGrad = isBest ? 'rgba(255,255,255,0.2)' : brandCfg.gradient;
  const badgeText = isBest ? '#FFFFFF' : brandCfg.textColor;
  const badgeShadow = isBest ? 'none' : `0 1px 4px ${brandCfg.color}50`;

  return L.divIcon({
    className: 'tp-marker',
    html: `
      <div class="tp-marker-bubble" style="
        opacity: ${opacity};
        background: ${bgColor};
        color: ${textColor};
        border: 2px solid ${borderColor};
        border-radius: 16px;
        padding: 3px 10px 3px 3px;
        font-size: 13px;
        font-weight: 700;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        white-space: nowrap;
        box-shadow: ${isBest
          ? '0 4px 14px rgba(37,117,234,0.35), 0 0 0 3px rgba(37,117,234,0.15)'
          : '0 2px 10px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)'};
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        transition: transform 0.15s cubic-bezier(0.4,0,0.2,1), box-shadow 0.15s ease;
        transform-origin: bottom center;
        position: relative;
      ">
        <span style="
          width: 24px; height: 24px;
          border-radius: 8px;
          background: ${badgeGrad};
          color: ${badgeText};
          display: flex; align-items: center; justify-content: center;
          font-size: ${brandCfg.initials.length > 2 ? '7px' : '10px'};
          font-weight: 800;
          flex-shrink: 0;
          letter-spacing: ${brandCfg.initials.length > 2 ? '0px' : '-0.3px'};
          box-shadow: ${badgeShadow}, inset 0 1px 0 rgba(255,255,255,0.15);
          text-shadow: ${badgeText === '#FFFFFF' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none'};
          position: relative;
          overflow: hidden;
        "><span style="position:relative;z-index:1">${brandCfg.initials}</span><span style="position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,0.3) 0%,transparent 50%,rgba(0,0,0,0.05) 100%);border-radius:8px;"></span></span>
        <span style="letter-spacing: -0.3px;">${priceText}</span>
        ${isBest ? `
          <span style="
            position: absolute;
            top: -6px; right: -6px;
            width: 16px; height: 16px;
            background: linear-gradient(135deg, #FBBF24 0%, #F59E0B 100%);
            border-radius: 50%;
            border: 2px solid white;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 6px rgba(245,158,11,0.4);
            color: white;
          ">${getStarSvg(8)}</span>
        ` : ''}
      </div>
      <div style="
        width: 2px; height: 10px;
        background: linear-gradient(to bottom, ${stemColor}, ${stemColor}00);
        margin: 0 auto;
      "></div>
      <div style="
        width: 7px; height: 7px;
        background: ${stemColor};
        border-radius: 50%;
        margin: -2px auto 0;
        box-shadow: 0 0 0 2px ${stemColor}30;
      "></div>
    `,
    iconSize: [0, 0],
    iconAnchor: [48, 52],
    popupAnchor: [0, -55],
  });
}

function createUserLocationIcon(): L.DivIcon {
  return L.divIcon({
    className: 'tp-user-marker',
    html: `
      <div style="position: relative; width: 16px; height: 16px;">
        <div style="
          position: absolute; inset: -4px;
          background: rgba(37,117,234,0.12);
          border-radius: 50%;
          animation: tp-pulse 2.5s ease-out infinite;
        "></div>
        <div style="
          position: absolute; inset: 0;
          background: #2575EA;
          border: 2.5px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 6px rgba(37,117,234,0.35), 0 0 0 2px rgba(37,117,234,0.12);
        "></div>
      </div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

// ─── Charging Station Marker ────────────────────────────────

function createChargingMarkerIcon(isOperational: boolean, maxPowerKW: number | null): L.DivIcon {
  const powerText = maxPowerKW ? `${maxPowerKW}kW` : '';
  const opacity = isOperational ? 1 : 0.5;
  // Blue markers for EV charging (#3b82f6)
  const bgColor = isOperational ? '#3b82f6' : '#94A3B8';
  const borderColor = isOperational ? '#2563eb' : '#CBD5E1';

  return L.divIcon({
    className: 'tp-marker',
    html: `
      <div style="
        opacity: ${opacity};
        background: ${bgColor};
        color: white;
        border: 2px solid ${borderColor};
        border-radius: 14px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 700;
        font-family: 'Inter', system-ui, sans-serif;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(59,130,246,0.3);
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        transition: transform 0.15s ease;
      ">
        <span style="font-size: 13px;">&#9889;</span>
        <span>${powerText}</span>
      </div>
      <div style="
        width: 2px; height: 8px;
        background: linear-gradient(to bottom, ${bgColor}, transparent);
        margin: 0 auto;
      "></div>
    `,
    iconSize: [0, 0],
    iconAnchor: [35, 40],
    popupAnchor: [0, -42],
  });
}

// ─── Hydrogen Station Marker (Cyan/Teal) ───────────────────

function createH2MarkerIcon(isAvailable: boolean, pricePerKg: number | null): L.DivIcon {
  const priceText = pricePerKg != null ? `${pricePerKg.toFixed(2)}€` : 'H2';
  const opacity = isAvailable ? 1 : 0.5;
  // Cyan/teal markers for H2 (#06b6d4)
  const bgColor = isAvailable ? '#06b6d4' : '#94A3B8';
  const borderColor = isAvailable ? '#0891b2' : '#CBD5E1';

  return L.divIcon({
    className: 'tp-marker',
    html: `
      <div style="
        opacity: ${opacity};
        background: ${bgColor};
        color: white;
        border: 2px solid ${borderColor};
        border-radius: 14px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 700;
        font-family: 'Inter', system-ui, sans-serif;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(6,182,212,0.3);
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        transition: transform 0.15s ease;
      ">
        <span style="font-size: 12px;">&#128167;</span>
        <span>${priceText}</span>
      </div>
      <div style="
        width: 2px; height: 8px;
        background: linear-gradient(to bottom, ${bgColor}, transparent);
        margin: 0 auto;
      "></div>
    `,
    iconSize: [0, 0],
    iconAnchor: [35, 40],
    popupAnchor: [0, -42],
  });
}

// ─── Gas Station Marker (LPG/CNG — Orange) ─────────────────

function createGasMarkerIcon(isOpen: boolean, gasTypes: readonly string[], lowestPrice: number | null): L.DivIcon {
  const label = lowestPrice != null ? `${lowestPrice.toFixed(2)}€` : gasTypes.map((t) => t.toUpperCase()).join('/');
  const opacity = isOpen ? 1 : 0.5;
  // Orange markers for Gas (#f97316)
  const bgColor = isOpen ? '#f97316' : '#94A3B8';
  const borderColor = isOpen ? '#ea580c' : '#CBD5E1';

  return L.divIcon({
    className: 'tp-marker',
    html: `
      <div style="
        opacity: ${opacity};
        background: ${bgColor};
        color: white;
        border: 2px solid ${borderColor};
        border-radius: 14px;
        padding: 3px 8px;
        font-size: 11px;
        font-weight: 700;
        font-family: 'Inter', system-ui, sans-serif;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(249,115,22,0.3);
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        transition: transform 0.15s ease;
      ">
        <span style="font-size: 12px;">&#128293;</span>
        <span>${label}</span>
      </div>
      <div style="
        width: 2px; height: 8px;
        background: linear-gradient(to bottom, ${bgColor}, transparent);
        margin: 0 auto;
      "></div>
    `,
    iconSize: [0, 0],
    iconAnchor: [35, 40],
    popupAnchor: [0, -42],
  });
}

function MapController({
  center,
  zoom,
  onBoundsChange,
}: {
  center: [number, number];
  zoom: number;
  onBoundsChange?: (center: { lat: number; lng: number }, radiusKm: number) => void;
}) {
  const map = useMap();
  const prevCenter = useRef<[number, number] | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isProgrammatic = useRef(false);

  useEffect(() => {
    if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) return;
    if (
      prevCenter.current &&
      prevCenter.current[0] === center[0] &&
      prevCenter.current[1] === center[1]
    ) {
      return;
    }

    const isFirstRender = !prevCenter.current;
    prevCenter.current = center;
    isProgrammatic.current = true;

    if (isFirstRender) {
      map.setView(center, zoom);
      setTimeout(() => {
        isProgrammatic.current = false;
      }, 100);
      return;
    }

    map.flyTo(center, zoom, {
      duration: 1.2,
      easeLinearity: 0.25,
    });

    setTimeout(() => {
      isProgrammatic.current = false;
    }, 1500);
  }, [map, center, zoom]);

  useMapEvents({
    moveend: () => {
      if (!onBoundsChange || isProgrammatic.current) return;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const currentCenter = map.getCenter();
        const bounds = map.getBounds();
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const latDiff = Math.abs(ne.lat - sw.lat);
        const lngDiff = Math.abs(ne.lng - sw.lng);
        const latKm = latDiff * 111.32;
        const lngKm = lngDiff * 111.32 * Math.cos((currentCenter.lat * Math.PI) / 180);
        const radiusKm = Math.sqrt(latKm * latKm + lngKm * lngKm) / 2;
        onBoundsChange({ lat: currentCenter.lat, lng: currentCenter.lng }, Math.max(radiusKm, 1));
      }, 800);
    },
  });

  return null;
}

function MapRefCapture({ mapRef }: { mapRef: MutableRefObject<L.Map | null> }) {
  const map = useMap();

  useEffect(() => {
    mapRef.current = map;
  }, [map, mapRef]);

  return null;
}

function createClusterIcon(cluster: { getChildCount(): number }): L.DivIcon {
  const count = cluster.getChildCount();
  return getCachedIcon(clusterMarkerKey(count), () => {
    const size = count < 10 ? 40 : count < 50 ? 48 : 56;
    const fontSize = count < 10 ? 14 : count < 50 ? 13 : 12;

    return L.divIcon({
      className: 'tp-cluster',
      html: `
        <div style="
          width: ${size}px; height: ${size}px;
          border-radius: 50%;
          background: linear-gradient(135deg, #2575EA 0%, #1D5FD7 100%);
          color: white;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: ${fontSize}px;
          font-weight: 700;
          box-shadow: 0 4px 14px rgba(37,117,234,0.4), 0 0 0 4px rgba(37,117,234,0.15);
          border: 3px solid rgba(255,255,255,0.8);
          cursor: pointer;
          transition: transform 0.2s ease;
        ">
          <span style="letter-spacing: 0.2px;">${count}</span>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  });
}

export function StationMap({
  recommendations,
  chargingStations = [],
  extraStations = [],
  onStationClick,
  onBoundsChange,
  onReload,
  onRequestLocation,
}: StationMapProps) {
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const userLocation = useAppStore((s) => s.userLocation);
  const mapStyle = useAppStore((s) => s.settings.mapStyle);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setMapCenter = useAppStore((s) => s.setMapCenter);
  const setMapRadiusKm = useAppStore((s) => s.setMapRadiusKm);

  const h2Stations = useMemo(
    () => extraStations.filter(isHydrogenStation) as UnifiedHydrogenStation[],
    [extraStations],
  );
  const gasStations = useMemo(
    () => extraStations.filter(isGasStation) as UnifiedGasStation[],
    [extraStations],
  );

  const { tileUrl, tileAttribution } = useMemo(() => {
    switch (mapStyle) {
      case 'satellite':
        return { tileUrl: TILE_SATELLITE_URL, tileAttribution: TILE_SATELLITE_ATTRIBUTION };
      case 'terrain':
        return { tileUrl: TILE_TERRAIN_URL, tileAttribution: TILE_TERRAIN_ATTRIBUTION };
      case 'dark':
        return { tileUrl: TILE_DARK_URL, tileAttribution: TILE_ATTRIBUTION };
      default:
        // Always use light Voyager tiles for the standard style —
        // the map should stay bright and readable even in dark mode.
        // Dark map tiles can be selected explicitly via the map style picker.
        return { tileUrl: TILE_URL, tileAttribution: TILE_ATTRIBUTION };
    }
  }, [mapStyle]);

  const center = useMemo<[number, number]>(() => {
    if (
      userLocation &&
      isFiniteCoordinate(userLocation.lat) &&
      isFiniteCoordinate(userLocation.lng)
    ) {
      return [userLocation.lat, userLocation.lng];
    }

    return DEFAULT_CENTER;
  }, [userLocation]);

  const userIcon = useMemo(() => createUserLocationIcon(), []);
  const mapRef = useRef<L.Map | null>(null);
  const [styleOpen, setStyleOpen] = useState(false);

  const handleLocate = useCallback(() => {
    if (userLocation && mapRef.current) {
      setMapCenter(null);
      setMapRadiusKm(5);
      mapRef.current.flyTo([userLocation.lat, userLocation.lng], 15, { duration: 0.8 });
      return;
    }

    onRequestLocation?.();
  }, [userLocation, onRequestLocation, setMapCenter, setMapRadiusKm]);

  const btnClass = `w-10 h-10 bg-white/95 dark:bg-gray-800/95 rounded-xl
    shadow-lg shadow-black/10 backdrop-blur-sm
    flex items-center justify-center
    hover:bg-white dark:hover:bg-gray-700 hover:shadow-xl hover:scale-105
    active:scale-95 transition-all duration-150
    border border-white/50 dark:border-gray-600/50`;

  return (
    <div className="relative w-full h-full">
      <MapContainer
        center={center}
        zoom={DEFAULT_ZOOM}
        className="w-full h-full z-0"
        zoomControl={false}
        attributionControl={true}
      >
        <TileLayer attribution={tileAttribution} url={tileUrl} key={tileUrl} />
        <MapController center={center} zoom={DEFAULT_ZOOM} onBoundsChange={onBoundsChange} />
        <RouteLayer />
        <MapRefCapture mapRef={mapRef} />

        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={userIcon}
            interactive={false}
          />
        )}

        <MarkerClusterGroup
          chunkedLoading={true}
          maxClusterRadius={60}
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
          zoomToBoundsOnClick={true}
          disableClusteringAtZoom={15}
          iconCreateFunction={createClusterIcon}
        >
          {recommendations.map((rec) => {
            const price = rec.station.prices?.[fuelType];
            const cacheKey = priceMarkerKey(
              price,
              rec.isBestOption,
              rec.station.isOpen,
              rec.reachabilityStatus,
              rec.station.brand,
            );
            const icon = getCachedIcon(cacheKey, () =>
              createPriceMarkerIcon(
                price,
                rec.isBestOption,
                rec.station.isOpen,
                rec.reachabilityStatus,
                rec.station.brand,
              ),
            );

            return (
              <Marker
                key={rec.station.id}
                position={[rec.station.lat, rec.station.lng]}
                icon={icon}
                eventHandlers={{
                  click: () => onStationClick(rec.station.id),
                }}
              >
                <Popup className="tp-popup" closeButton={false} autoPan={false}>
                  {(() => {
                    const bc = getBrandConfig(rec.station.brand);
                    const isDark = document.documentElement.classList.contains('dark');
                    const textPrimary = isDark ? '#F1F5F9' : '#0F172A';
                    const textSecondary = isDark ? '#94A3B8' : '#64748B';
                    const textMuted = '#94A3B8';
                    const bestBg = isDark ? 'rgba(37,117,234,0.15)' : '#EFF6FF';

                    return (
                      <div
                        style={{
                          fontFamily: "'Inter', system-ui, sans-serif",
                          padding: '4px 2px',
                          minWidth: 170,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: 10,
                              background: bc.gradient,
                              color: bc.textColor,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: bc.initials.length > 2 ? 8 : 11,
                              fontWeight: 800,
                              flexShrink: 0,
                              boxShadow: `0 2px 8px ${bc.color}40, inset 0 1px 0 rgba(255,255,255,0.15)`,
                              textShadow: bc.textColor === '#FFFFFF' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
                              position: 'relative',
                              overflow: 'hidden',
                            }}
                          >
                            <span style={{ position: 'relative', zIndex: 1 }}>{bc.initials}</span>
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: textPrimary }}>
                              {rec.station.brand || rec.station.name}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: textSecondary,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {rec.station.street} {rec.station.houseNumber}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
                          <span style={{ fontSize: 11, color: textMuted }}>{FUEL_TYPE_LABELS[fuelType]}</span>
                          <span style={{ fontSize: 18, fontWeight: 800, color: textPrimary }}>
                            {price != null ? `${formatPrice(price)} EUR` : 'n/a'}
                          </span>
                        </div>
                        {rec.isBestOption && (
                          <div
                            style={{
                              marginTop: 6,
                              padding: '3px 8px',
                              background: bestBg,
                              borderRadius: 8,
                              fontSize: 11,
                              fontWeight: 600,
                              color: '#2575EA',
                              textAlign: 'center',
                            }}
                          >
                            Beste Empfehlung
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>

        {/* Charging station markers (for hybrid/electric vehicles) */}
        {chargingStations.map((cs) => {
          const maxPower = cs.connections.reduce((max, c) => Math.max(max, c.powerKW ?? 0), 0);
          const powerVal = maxPower > 0 ? maxPower : null;
          const icon = getCachedIcon(
            chargingMarkerKey(cs.isOperational, powerVal),
            () => createChargingMarkerIcon(cs.isOperational, powerVal),
          );

          return (
            <Marker
              key={`ev-${cs.id}`}
              position={[cs.lat, cs.lng]}
              icon={icon}
            >
              <Popup className="tp-popup" closeButton={false} autoPan={false}>
                <div style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  padding: '4px 2px',
                  minWidth: 180,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      width: 30, height: 30, borderRadius: 10,
                      background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                      color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 15, flexShrink: 0,
                    }}>&#9889;</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>
                        {cs.operator || 'Ladestation'}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cs.address}, {cs.city}
                      </div>
                    </div>
                  </div>
                  {cs.connections.length > 0 && (
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                      {cs.connections.slice(0, 3).map((c, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                          <span>{c.type}</span>
                          <span style={{ fontWeight: 700 }}>{c.powerKW ? `${c.powerKW} kW` : '—'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {cs.usageCost && (
                    <div style={{
                      marginTop: 6, padding: '3px 8px',
                      background: '#EFF6FF', borderRadius: 8,
                      fontSize: 11, fontWeight: 600, color: '#2563eb',
                      textAlign: 'center',
                    }}>
                      {cs.usageCost}
                    </div>
                  )}
                  <div style={{
                    marginTop: 6, fontSize: 10, color: cs.isOperational ? '#3b82f6' : '#EF4444',
                    fontWeight: 600, textAlign: 'center',
                  }}>
                    {cs.isOperational ? 'In Betrieb' : 'Außer Betrieb'}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Hydrogen station markers (cyan/teal) */}
        {h2Stations.map((h2) => {
          const icon = getCachedIcon(
            h2MarkerKey(h2.h2Available, h2.h2PricePerKg),
            () => createH2MarkerIcon(h2.h2Available, h2.h2PricePerKg),
          );

          return (
            <Marker
              key={`h2-${h2.id}`}
              position={[h2.lat, h2.lng]}
              icon={icon}
              eventHandlers={{
                click: () => onStationClick(h2.id),
              }}
            >
              <Popup className="tp-popup" closeButton={false} autoPan={false}>
                <div style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  padding: '4px 2px',
                  minWidth: 180,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      width: 30, height: 30, borderRadius: 10,
                      background: 'linear-gradient(135deg, #06b6d4, #0891b2)',
                      color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 15, flexShrink: 0,
                    }}>&#128167;</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>
                        {h2.operator || h2.name || 'H2-Tankstelle'}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {h2.address.street} {h2.address.houseNumber}, {h2.address.city}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>Wasserstoff</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                      {h2.h2PricePerKg != null ? `${h2.h2PricePerKg.toFixed(2)} €/kg` : 'n/a'}
                    </span>
                  </div>
                  {h2.h2Pressure.length > 0 && (
                    <div style={{ fontSize: 10, color: '#64748B', marginTop: 4, textAlign: 'center' }}>
                      {h2.h2Pressure.map((p) => `${p} bar`).join(', ')}
                    </div>
                  )}
                  <div style={{
                    marginTop: 6, fontSize: 10,
                    color: h2.h2Available ? '#06b6d4' : '#EF4444',
                    fontWeight: 600, textAlign: 'center',
                  }}>
                    {h2.h2Available ? 'Verfügbar' : 'Nicht verfügbar'}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Gas station markers — LPG/CNG/LNG (orange) */}
        {gasStations.map((gs) => {
          const prices = Object.values(gs.gasPrices).filter((p): p is number => p != null);
          const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
          const typesStr = gs.gasTypes.join(',');
          const icon = getCachedIcon(
            gasMarkerKey(gs.isOpen, typesStr, lowestPrice),
            () => createGasMarkerIcon(gs.isOpen, gs.gasTypes, lowestPrice),
          );

          return (
            <Marker
              key={`gas-${gs.id}`}
              position={[gs.lat, gs.lng]}
              icon={icon}
              eventHandlers={{
                click: () => onStationClick(gs.id),
              }}
            >
              <Popup className="tp-popup" closeButton={false} autoPan={false}>
                <div style={{
                  fontFamily: "'Inter', system-ui, sans-serif",
                  padding: '4px 2px',
                  minWidth: 180,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{
                      width: 30, height: 30, borderRadius: 10,
                      background: 'linear-gradient(135deg, #f97316, #ea580c)',
                      color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 15, flexShrink: 0,
                    }}>&#128293;</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#0F172A' }}>
                        {gs.operator || gs.name || 'Gastankstelle'}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {gs.address.street} {gs.address.houseNumber}, {gs.address.city}
                      </div>
                    </div>
                  </div>
                  {gs.gasTypes.map((gt) => {
                    const price = gs.gasPrices[gt];
                    return (
                      <div key={gt} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: '#94A3B8' }}>{gt.toUpperCase()}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                          {price != null ? `${price.toFixed(3)} €` : 'n/a'}
                        </span>
                      </div>
                    );
                  })}
                  <div style={{
                    marginTop: 6, fontSize: 10,
                    color: gs.isOpen ? '#f97316' : '#EF4444',
                    fontWeight: 600, textAlign: 'center',
                  }}>
                    {gs.isOpen ? 'Geöffnet' : 'Geschlossen'}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2">
        <button
          type="button"
          onClick={() => mapRef.current?.zoomIn()}
          className={btnClass}
          aria-label="Vergrößern"
          title="Vergrößern"
        >
          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" d="M12 6v12M6 12h12" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          className={btnClass}
          aria-label="Verkleinern"
          title="Verkleinern"
        >
          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" d="M6 12h12" />
          </svg>
        </button>

        <div className="h-px bg-gray-200 dark:bg-gray-700 mx-2" />

        <button
          type="button"
          onClick={handleLocate}
          className={btnClass}
          aria-label={userLocation ? 'Zu meinem Standort' : 'Standort ermitteln'}
          title={userLocation ? 'Zu meinem Standort' : 'Standort ermitteln'}
        >
          {userLocation ? (
            <svg className="w-5 h-5 text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2m0 16v2M2 12h2m16 0h2" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
            </svg>
          )}
        </button>

        {onReload && (
          <button
            type="button"
            onClick={onReload}
            className={btnClass}
            aria-label="Preise aktualisieren"
            title="Preise aktualisieren"
          >
            <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.016 4.356v4.992" />
            </svg>
          </button>
        )}

        <div className="relative">
          <button
            type="button"
            onClick={() => setStyleOpen((open) => !open)}
            className={btnClass}
            aria-label="Kartenstil"
            title="Kartenstil"
          >
            <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
            </svg>
          </button>

          {styleOpen && (
            <div
              className="absolute right-12 top-0 bg-white dark:bg-gray-800
                         rounded-xl shadow-lg border border-gray-200 dark:border-gray-700
                         overflow-hidden min-w-[140px]"
            >
              {MAP_STYLES.map((style) => (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => {
                    updateSettings({ mapStyle: style.id });
                    setStyleOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2
                    transition-colors border-b border-gray-100 dark:border-gray-700 last:border-b-0
                    ${mapStyle === style.id
                      ? 'bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-400 font-semibold'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                >
                  <span className="inline-flex min-w-7 justify-center text-xs font-semibold text-gray-500 dark:text-gray-400">
                    {style.icon}
                  </span>
                  <span>{style.label}</span>
                  {mapStyle === style.id && (
                    <svg className="w-4 h-4 ml-auto text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div
        className="absolute bottom-4 left-4 z-[1000] bg-white/90 dark:bg-gray-800/90
                   backdrop-blur-sm rounded-xl px-3 py-2 shadow-md
                   border border-gray-100 dark:border-gray-700
                   text-[10px] text-gray-500 dark:text-gray-400
                   flex items-center gap-3 flex-wrap"
      >
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-reach-safe" />
          Tankstellen
        </span>
        <span className="flex items-center gap-1">
          <span
            className="w-3.5 h-3.5 rounded bg-brand-600 text-white flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: getStarSvg(8) }}
          />
          Beste
        </span>
        {chargingStations.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded text-white text-[8px] flex items-center justify-center font-bold" style={{ background: '#3b82f6' }}>&#9889;</span>
            Ladesäulen
          </span>
        )}
        {h2Stations.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded text-white text-[8px] flex items-center justify-center font-bold" style={{ background: '#06b6d4' }}>&#128167;</span>
            Wasserstoff
          </span>
        )}
        {gasStations.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded text-white text-[8px] flex items-center justify-center font-bold" style={{ background: '#f97316' }}>&#128293;</span>
            Gas (LPG/CNG)
          </span>
        )}
      </div>
    </div>
  );
}
