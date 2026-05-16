// ============================================================
// StationMap - Premium map with custom price markers
// Uses CartoDB Voyager tiles for a clean, modern look and
// custom HTML markers with animated price bubbles.
// ============================================================

'use client';

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import type { MutableRefObject } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { StationRecommendation, ChargingStation, UnifiedStation, UnifiedHydrogenStation, UnifiedGasStation } from '@fuelyn/core';
import { formatPrice, FUEL_TYPE_LABELS, isHydrogenStation, isGasStation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { getBrandConfig } from '@/lib/brand-config';
import { getCachedIcon, priceMarkerKey, chargingMarkerKey, h2MarkerKey, gasMarkerKey } from '@/lib/utils/marker-cache';
import {
  notchSvg,
  groundShadowDiv,
  lightningIcon,
  dropletIcon,
  flameIcon,
  starIcon,
  CHIP_SHEEN_GRADIENT,
} from '@/lib/utils/marker-svg';
import { RouteLayer } from './RouteLayer';
import { HeatmapLayer } from './HeatmapLayer';

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
// Carto's "Dark Matter Nolabels" base — true cinematic black
// background, very few road labels, perfect substrate for the
// Fuelyn marker style. We pair it with a manually-added Carto
// labels overlay so place names stay legible without dominating.
const TILE_PREMIUM_URL = 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png';
const TILE_SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const TILE_TERRAIN_URL = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const TILE_SATELLITE_ATTRIBUTION = '&copy; Esri, Maxar, Earthstar Geographics';
const TILE_TERRAIN_ATTRIBUTION = '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>';

const MAP_STYLES = [
  { id: 'standard',  label: 'Standard',  icon: 'S' },
  { id: 'premium',   label: 'Premium',   icon: 'Pr' },
  { id: 'dark',      label: 'Dark',      icon: 'D' },
  { id: 'satellite', label: 'Satellit',  icon: 'Sat' },
  { id: 'terrain',   label: 'Gelände',   icon: 'Ter' },
] as const;

function isFiniteCoordinate(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 180;
}

type PriceTier = 'low' | 'mid' | 'high';

function createPriceMarkerIcon(
  price: number | null,
  isBest: boolean,
  isOpen: boolean,
  reachability: 'safe' | 'tight' | 'unreachable',
  brand: string,
  priceTier: PriceTier = 'mid',
  isSelected: boolean = false,
): L.DivIcon {
  const brandCfg = getBrandConfig(brand);
  const noPrice = price == null;

  // Stations without a price for the currently filtered fuel type render
  // as a compact, dimmed brand chip — discoverable but not competing
  // visually with priced stations. Same depth treatment as the priced
  // bubble's brand chip (gradient + inner highlight + sheen overlay)
  // plus the speech-bubble notch so it shares the family resemblance.
  if (noPrice) {
    const dimOpacity = isOpen ? 0.72 : 0.34;
    const closedFilter = isOpen ? '' : 'filter: grayscale(0.5) saturate(0.7);';
    const fontSize = brandCfg.initials.length > 2 ? '9px' : '12px';
    const letterSp = brandCfg.initials.length > 2 ? '0px' : '-0.3px';
    return L.divIcon({
      className: 'tp-marker',
      html: `
        <div class="tp-marker-bubble" style="
          opacity: ${dimOpacity};
          ${closedFilter}
          position: relative;
          width: 32px; height: 32px;
          border-radius: 11px;
          background: ${brandCfg.gradient};
          color: ${brandCfg.textColor};
          border: 1.5px solid rgba(255,255,255,0.55);
          display: flex; align-items: center; justify-content: center;
          font-size: ${fontSize};
          font-weight: 800;
          letter-spacing: ${letterSp};
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          box-shadow:
            0 1px 3px ${brandCfg.color}55,
            0 4px 10px rgba(15,23,42,0.10),
            inset 0 1px 0 rgba(255,255,255,0.30),
            inset 0 -1px 2px rgba(0,0,0,0.10);
          text-shadow: ${brandCfg.textColor === '#FFFFFF' ? '0 1px 1px rgba(0,0,0,0.25)' : 'none'};
          cursor: pointer;
          transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1);
          transform-origin: bottom center;
          overflow: hidden;
        "><span style="position:relative;z-index:1">${brandCfg.initials}</span><span aria-hidden="true" style="position:absolute;inset:0;background:${CHIP_SHEEN_GRADIENT};"></span></div>
        ${notchSvg(brandCfg.color, 'rgba(255,255,255,0.55)')}
        ${groundShadowDiv()}
      `,
      iconSize: [0, 0],
      iconAnchor: [16, 44],
      popupAnchor: [0, -46],
    });
  }

  const priceText = formatPrice(price);

  // ─── Visual treatment per state ────────────────────────────
  // - isBest: blue glass bubble with gold halo + crown badge
  // - reachability: subtle outer ring tint (safety override)
  // - priceTier: emerald/neutral/rose halo by quartile across the
  //   current view → user can scan the map for cheap deals at a glance,
  //   independent of the brand colour.
  // - !isOpen: muted, desaturated + grayscale (modern closed treatment)
  const opacity = !isOpen ? 0.55 : 1;
  const closedFilter = !isOpen ? 'filter: grayscale(0.5) saturate(0.65);' : '';

  // Reachability concerns dominate aesthetics — render the warning ring
  // verbatim regardless of tier when the station is reachable but tight,
  // or unreachable for the user's vehicle range.
  const reachabilityShadow = reachability === 'unreachable'
    ? '0 0 0 2px rgba(239,68,68,0.45), 0 4px 14px rgba(239,68,68,0.18)'
    : reachability === 'tight'
      ? '0 0 0 2px rgba(245,158,11,0.45), 0 4px 14px rgba(245,158,11,0.18)'
      : null;

  // Price tier glow — emerald for cheap, neutral for mid, rose for high.
  // Cheap deals get a stronger, more eye-catching halo than the rose
  // signal so the user's eye is pulled toward savings (not warnings).
  const tierShadow = priceTier === 'low'
    ? '0 0 0 1.5px rgba(16,185,129,0.55), 0 4px 18px rgba(16,185,129,0.30), 0 1px 3px rgba(15,23,42,0.10)'
    : priceTier === 'high'
      ? '0 0 0 1px rgba(239,68,68,0.30), 0 1px 3px rgba(15,23,42,0.10), 0 6px 16px rgba(15,23,42,0.08)'
      : '0 1px 3px rgba(15,23,42,0.10), 0 6px 16px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.06)';

  // Bubble appearance — best gets full blue/glass + gold halo,
  // regular gets translucent white with subtle tier-aware ring.
  const bubbleBg = isBest
    ? 'linear-gradient(135deg, #2D7FF0 0%, #1D5FD7 60%, #1747B8 100%)'
    : 'rgba(255,255,255,0.96)';
  const bubbleColor = isBest ? '#FFFFFF' : '#0F172A';
  const bubbleBorder = isBest ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.9)';
  const bubbleShadow = isBest
    ? '0 0 0 2px rgba(251,191,36,0.7), 0 0 0 5px rgba(251,191,36,0.2), 0 6px 18px rgba(37,117,234,0.45), 0 12px 36px rgba(251,191,36,0.22)'
    : (reachabilityShadow ?? tierShadow);

  // Notch fill/stroke match the bubble. For the translucent-white
  // bubble we use a solid white to avoid the SVG triangle going see-
  // through against the map.
  const notchFill = isBest ? '#1D5FD7' : '#FFFFFF';
  const notchStroke = isBest
    ? 'rgba(255,255,255,0.45)'
    : 'rgba(15,23,42,0.10)';

  // Brand chip: bigger, stronger highlight, embedded sheen overlay.
  const chipBg = isBest ? 'rgba(255,255,255,0.18)' : brandCfg.gradient;
  const chipText = isBest ? '#FFFFFF' : brandCfg.textColor;
  const chipBorder = isBest ? '1px solid rgba(255,255,255,0.35)' : 'none';
  const chipShadow = isBest
    ? 'inset 0 1px 0 rgba(255,255,255,0.25)'
    : `0 1px 3px ${brandCfg.color}55, inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 2px rgba(0,0,0,0.10)`;
  const chipFontSize = brandCfg.initials.length > 2 ? '8px' : '11px';
  const chipLetterSp = brandCfg.initials.length > 2 ? '0px' : '-0.3px';

  return L.divIcon({
    // The `is-best` modifier triggers a slow gold-halo pulse keyframe
    // (see globals.css). Use a hover/active aware class chain so the
    // CSS layer can animate without us having to inline keyframes.
    className: `tp-marker${isBest ? ' tp-marker--best' : ''}${priceTier === 'low' ? ' tp-marker--cheap' : ''}${isSelected ? ' tp-marker--selected' : ''}`,
    html: `
      <div class="tp-marker-bubble${isBest ? ' is-best' : ''}" style="
        opacity: ${opacity};
        ${closedFilter}
        background: ${bubbleBg};
        color: ${bubbleColor};
        border: 1.5px solid ${bubbleBorder};
        border-radius: 18px;
        padding: 4px 13px 4px 4px;
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        font-weight: 700;
        white-space: nowrap;
        box-shadow: ${bubbleShadow};
        backdrop-filter: blur(10px) saturate(1.4);
        -webkit-backdrop-filter: blur(10px) saturate(1.4);
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s ease;
        transform-origin: bottom center;
        position: relative;
      ">
        <span style="
          width: 26px; height: 26px;
          border-radius: 9px;
          background: ${chipBg};
          color: ${chipText};
          border: ${chipBorder};
          display: flex; align-items: center; justify-content: center;
          font-size: ${chipFontSize};
          font-weight: 800;
          flex-shrink: 0;
          letter-spacing: ${chipLetterSp};
          box-shadow: ${chipShadow};
          text-shadow: ${chipText === '#FFFFFF' ? '0 1px 1px rgba(0,0,0,0.25)' : 'none'};
          position: relative;
          overflow: hidden;
        "><span style="position:relative;z-index:1">${brandCfg.initials}</span><span style="position:absolute;inset:0;background:${CHIP_SHEEN_GRADIENT};"></span></span>
        <span style="font-size:14px; letter-spacing:-0.3px; font-variant-numeric: tabular-nums; font-feature-settings: 'tnum', 'cv11';">${priceText}</span>
        ${isBest ? `
          <span style="
            position: absolute;
            top: -9px; right: -9px;
            width: 22px; height: 22px;
            background: linear-gradient(135deg, #FCD34D 0%, #FBBF24 50%, #F59E0B 100%);
            border-radius: 50%;
            border: 2.5px solid white;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 2px 8px rgba(245,158,11,0.55), 0 0 0 1px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.4);
            color: white;
          ">${starIcon(11)}</span>
        ` : ''}
      </div>
      ${notchSvg(notchFill, notchStroke)}
      ${groundShadowDiv()}
    `,
    iconSize: [0, 0],
    iconAnchor: [48, 44],
    popupAnchor: [0, -46],
  });
}

function createUserLocationIcon(): L.DivIcon {
  return L.divIcon({
    className: 'tp-user-marker',
    html: `
      <div style="position: relative; width: 18px; height: 18px;">
        <div style="
          position: absolute; inset: -8px;
          background: radial-gradient(circle, rgba(37,117,234,0.22) 0%, rgba(37,117,234,0) 70%);
          border-radius: 50%;
          animation: tp-pulse 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        "></div>
        <div style="
          position: absolute; inset: 0;
          background: radial-gradient(circle at 30% 30%, #4F95FF 0%, #2575EA 60%, #1D5FD7 100%);
          border: 3px solid white;
          border-radius: 50%;
          box-shadow:
            0 0 0 2px rgba(37,117,234,0.18),
            0 3px 10px rgba(37,117,234,0.45),
            inset 0 1px 0 rgba(255,255,255,0.35);
        "></div>
      </div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

// ─── Energy Station Markers (Charging / Hydrogen / Gas) ────
//
// Shared visual language with the price marker: speech-bubble pill
// + downward notch + soft ground shadow. The differentiator is the
// inline SVG icon at the leading edge — a lightning bolt for EV
// charging, a droplet for H2, and a flame for LPG/CNG. SVG is used
// in place of the legacy HTML emoji entities (`&#9889;` etc.)
// because emoji rendering depends on the OS font stack: the same
// glyph would land as a glassy iOS lightning bolt for some users
// and a flat Windows 11 monochrome for others. SVG gives every
// user the same crisp identity.

interface EnergyMarkerOpts {
  readonly available: boolean;
  readonly label: string;
  readonly iconSvg: string;
  readonly bgGradient: string;
  readonly borderColor: string;
  readonly notchFill: string;
  readonly glowRgba: string;
}

function createEnergyMarkerIcon({
  available,
  label,
  iconSvg,
  bgGradient,
  borderColor,
  notchFill,
  glowRgba,
}: EnergyMarkerOpts): L.DivIcon {
  const opacity = available ? 1 : 0.55;
  const dimFilter = available ? '' : 'filter: grayscale(0.5) saturate(0.65);';

  return L.divIcon({
    className: 'tp-marker',
    html: `
      <div class="tp-marker-bubble" style="
        opacity: ${opacity};
        ${dimFilter}
        background: ${bgGradient};
        color: white;
        border: 1.5px solid ${borderColor};
        border-radius: 16px;
        padding: 4px 11px 4px 5px;
        font-size: 11.5px;
        font-weight: 700;
        font-family: 'Inter', system-ui, sans-serif;
        white-space: nowrap;
        letter-spacing: -0.2px;
        box-shadow:
          0 2px 6px ${glowRgba},
          0 6px 16px rgba(15,23,42,0.10),
          inset 0 1px 0 rgba(255,255,255,0.30),
          inset 0 -1px 2px rgba(0,0,0,0.10);
        text-shadow: 0 1px 1px rgba(0,0,0,0.20);
        display: flex;
        align-items: center;
        gap: 5px;
        cursor: pointer;
        transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s ease;
        transform-origin: bottom center;
      ">
        <span style="
          display: inline-flex;
          width: 18px; height: 18px;
          border-radius: 6px;
          align-items: center; justify-content: center;
          background: rgba(255,255,255,0.20);
          color: white;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.25);
        ">${iconSvg}</span>
        <span style="font-variant-numeric: tabular-nums; font-feature-settings: 'tnum', 'cv11';">${label}</span>
      </div>
      ${notchSvg(notchFill, 'rgba(255,255,255,0.40)')}
      ${groundShadowDiv()}
    `,
    iconSize: [0, 0],
    iconAnchor: [38, 42],
    popupAnchor: [0, -44],
  });
}

function createChargingMarkerIcon(isOperational: boolean, maxPowerKW: number | null): L.DivIcon {
  const powerText = maxPowerKW ? `${maxPowerKW} kW` : 'EV';
  return createEnergyMarkerIcon({
    available: isOperational,
    label: powerText,
    iconSvg: lightningIcon(12, '#FFFFFF'),
    bgGradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
    borderColor: 'rgba(255,255,255,0.55)',
    notchFill: '#2563eb',
    glowRgba: 'rgba(59,130,246,0.45)',
  });
}

function createH2MarkerIcon(isAvailable: boolean, pricePerKg: number | null): L.DivIcon {
  const label = pricePerKg != null ? `${pricePerKg.toFixed(2)} €` : 'H₂';
  return createEnergyMarkerIcon({
    available: isAvailable,
    label,
    iconSvg: dropletIcon(12, '#FFFFFF'),
    bgGradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
    borderColor: 'rgba(255,255,255,0.55)',
    notchFill: '#0891b2',
    glowRgba: 'rgba(6,182,212,0.45)',
  });
}

function createGasMarkerIcon(isOpen: boolean, gasTypes: readonly string[], lowestPrice: number | null): L.DivIcon {
  const label = lowestPrice != null
    ? `${lowestPrice.toFixed(2)} €`
    : gasTypes.map((t) => t.toUpperCase()).join('/');
  return createEnergyMarkerIcon({
    available: isOpen,
    label,
    iconSvg: flameIcon(12, '#FFFFFF'),
    bgGradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
    borderColor: 'rgba(255,255,255,0.55)',
    notchFill: '#ea580c',
    glowRgba: 'rgba(249,115,22,0.45)',
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
  /** Phase 3b: map-wide selection state used to dim non-selected markers. */
  const selectedStationId = useAppStore((s) => s.selectedStationId);

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
      case 'premium':
        // Cinematic black-background no-labels base; pair with the
        // labels-only overlay below so place names stay readable.
        return { tileUrl: TILE_PREMIUM_URL, tileAttribution: TILE_ATTRIBUTION };
      default:
        // Light Voyager tiles for the standard style — the map should
        // stay bright and readable even in dark mode. Dark/Premium can
        // be selected explicitly via the map style picker.
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
  /**
   * Heatmap overlay toggle (Phase 3a). When ON we render a
   * HeatmapLayer that paints translucent emerald/amber/rose circles
   * over each station — a price-density visual that lets the user
   * sweep the map for cheap regions without zooming into individual
   * markers.
   */
  const [heatmapOn, setHeatmapOn] = useState(false);

  // Price-tier classification across the current viewport. Stations
  // are bucketed into 'low' (cheapest 33%), 'mid', or 'high' (most
  // expensive 33%) based on a tertile cut on prices observed RIGHT NOW.
  // The marker visual then carries an emerald / neutral / rose tint
  // halo so the user can scan the map for cheap deals at a glance,
  // independent of brand colour. Re-computed only when recommendations
  // or fuel type change (cheap, runs once per useMemo invalidation).
  const priceTiers = useMemo<Map<string, 'low' | 'mid' | 'high'>>(() => {
    const out = new Map<string, 'low' | 'mid' | 'high'>();
    const prices = recommendations
      .map((r) => ({ id: r.station.id, p: r.station.prices?.[fuelType] }))
      .filter((x): x is { id: string; p: number } =>
        typeof x.p === 'number' && x.p > 0,
      );
    if (prices.length < 3) {
      // Not enough variance to be meaningful — every priced station is
      // 'mid', which renders as the existing neutral halo.
      for (const x of prices) out.set(x.id, 'mid');
      return out;
    }
    const sorted = [...prices].sort((a, b) => a.p - b.p);
    const lowCut = sorted[Math.floor(sorted.length * 0.33)]!.p;
    const highCut = sorted[Math.floor(sorted.length * 0.67)]!.p;
    for (const x of prices) {
      out.set(
        x.id,
        x.p <= lowCut ? 'low' : x.p >= highCut ? 'high' : 'mid',
      );
    }
    return out;
  }, [recommendations, fuelType]);

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
        className={`w-full h-full z-0${selectedStationId ? ' fy-map-has-selection' : ''}`}
        zoomControl={false}
        attributionControl={true}
      >
        <TileLayer attribution={tileAttribution} url={tileUrl} key={tileUrl} />
        <MapController center={center} zoom={DEFAULT_ZOOM} onBoundsChange={onBoundsChange} />
        <RouteLayer />
        <MapRefCapture mapRef={mapRef} />
        {heatmapOn && <HeatmapLayer recommendations={recommendations} />}

        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={userIcon}
            interactive={false}
          />
        )}

        {/* Clustering temporarily disabled: react-leaflet-cluster@4.1.3 is
            incompatible with react-leaflet@5 / React 19. Children mounted
            after a hydration-induced re-render are silently dropped, so no
            station marker reaches the Leaflet layer. Plain <Marker> works.
            Re-enable once the cluster lib catches up (or replace with
            a fork like @changey/react-leaflet-markercluster). */}
        <>
          {recommendations.map((rec) => {
            const price = rec.station.prices?.[fuelType];
            const tier = priceTiers.get(rec.station.id) ?? 'mid';
            const isSelected = selectedStationId === rec.station.id;
            // Selection state participates in the cache key so we don't
            // overwrite the un-selected variant — when the user clicks
            // a different station, both icons stay reusable.
            const cacheKey = priceMarkerKey(
              price,
              rec.isBestOption,
              rec.station.isOpen,
              rec.reachabilityStatus,
              rec.station.brand,
              tier,
            ) + (isSelected ? ':sel' : '');
            const icon = getCachedIcon(cacheKey, () =>
              createPriceMarkerIcon(
                price,
                rec.isBestOption,
                rec.station.isOpen,
                rec.reachabilityStatus,
                rec.station.brand,
                tier,
                isSelected,
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
                            {price != null ? `${formatPrice(price)} €` : '—'}
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
        </>

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
                {(() => {
                  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
                  const textPrimary = isDark ? '#F1F5F9' : '#0F172A';
                  const textSecondary = isDark ? '#CBD5E1' : '#64748B';
                  const textMuted = isDark ? '#94A3B8' : '#94A3B8';
                  const rowText = isDark ? '#E2E8F0' : '#475569';
                  const costBg = isDark ? 'rgba(59,130,246,0.18)' : '#EFF6FF';
                  return (
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
                          flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(59,130,246,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
                        }} dangerouslySetInnerHTML={{ __html: lightningIcon(15, '#FFFFFF') }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: textPrimary }}>
                            {cs.operator || 'Ladestation'}
                          </div>
                          <div style={{ fontSize: 11, color: textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {cs.address}, {cs.city}
                          </div>
                        </div>
                      </div>
                      {cs.connections.length > 0 && (
                        <div style={{ fontSize: 11, color: rowText, marginTop: 4 }}>
                          {cs.connections.slice(0, 3).map((c, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                              <span style={{ color: textMuted }}>{c.type}</span>
                              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.powerKW ? `${c.powerKW} kW` : '—'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {cs.usageCost && (
                        <div style={{
                          marginTop: 6, padding: '3px 8px',
                          background: costBg, borderRadius: 8,
                          fontSize: 11, fontWeight: 600, color: '#3b82f6',
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
                  );
                })()}
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
                {(() => {
                  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
                  const textPrimary = isDark ? '#F1F5F9' : '#0F172A';
                  const textSecondary = isDark ? '#CBD5E1' : '#64748B';
                  const textMuted = isDark ? '#94A3B8' : '#94A3B8';
                  return (
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
                          flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(6,182,212,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
                        }} dangerouslySetInnerHTML={{ __html: dropletIcon(15, '#FFFFFF') }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: textPrimary }}>
                            {h2.operator || h2.name || 'H2-Tankstelle'}
                          </div>
                          <div style={{ fontSize: 11, color: textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {h2.address.street} {h2.address.houseNumber}, {h2.address.city}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                        <span style={{ fontSize: 11, color: textMuted }}>Wasserstoff</span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                          {h2.h2PricePerKg != null ? `${h2.h2PricePerKg.toFixed(2)} €/kg` : '—'}
                        </span>
                      </div>
                      {h2.h2Pressure.length > 0 && (
                        <div style={{ fontSize: 10, color: textSecondary, marginTop: 4, textAlign: 'center' }}>
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
                  );
                })()}
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
                {(() => {
                  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
                  const textPrimary = isDark ? '#F1F5F9' : '#0F172A';
                  const textSecondary = isDark ? '#CBD5E1' : '#64748B';
                  const textMuted = isDark ? '#94A3B8' : '#94A3B8';
                  return (
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
                          flexShrink: 0,
                          boxShadow: '0 2px 8px rgba(249,115,22,0.40), inset 0 1px 0 rgba(255,255,255,0.20)',
                        }} dangerouslySetInnerHTML={{ __html: flameIcon(15, '#FFFFFF') }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: textPrimary }}>
                            {gs.operator || gs.name || 'Gastankstelle'}
                          </div>
                          <div style={{ fontSize: 11, color: textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {gs.address.street} {gs.address.houseNumber}, {gs.address.city}
                          </div>
                        </div>
                      </div>
                      {gs.gasTypes.map((gt) => {
                        const price = gs.gasPrices[gt];
                        return (
                          <div key={gt} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
                            <span style={{ fontSize: 11, color: textMuted }}>{gt.toUpperCase()}</span>
                            <span style={{ fontSize: 14, fontWeight: 700, color: textPrimary, fontVariantNumeric: 'tabular-nums' }}>
                              {price != null ? `${price.toFixed(3)} €` : '—'}
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
                  );
                })()}
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

        {/* Heatmap toggle (Phase 3a) — overlays a translucent
            emerald/amber/rose density layer so cheap regions pop
            without zooming into individual markers. */}
        <button
          type="button"
          onClick={() => setHeatmapOn((on) => !on)}
          className={btnClass + (heatmapOn ? ' ring-2 ring-emerald-500' : '')}
          aria-label={heatmapOn ? 'Heatmap aus' : 'Heatmap an'}
          title={heatmapOn ? 'Heatmap aus' : 'Heatmap an'}
        >
          <svg
            className={`w-5 h-5 ${heatmapOn ? 'text-emerald-500' : 'text-gray-700 dark:text-gray-300'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
          </svg>
        </button>

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
        className="absolute bottom-4 left-4 z-[1000]
                   bg-white/85 dark:bg-gray-900/80
                   backdrop-blur-md backdrop-saturate-150
                   rounded-2xl px-3.5 py-2
                   shadow-[0_4px_18px_-2px_rgba(15,23,42,0.12),0_2px_4px_-2px_rgba(15,23,42,0.06)]
                   border border-white/60 dark:border-gray-700/60
                   text-[10.5px] text-gray-500 dark:text-gray-400
                   flex items-center gap-x-3.5 gap-y-1 flex-wrap"
      >
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.18)]" />
          <span className="font-medium text-gray-600 dark:text-gray-300">Tankstellen</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-4 h-4 rounded-md flex items-center justify-center text-white
                       bg-gradient-to-br from-amber-300 via-amber-400 to-amber-500
                       shadow-[0_1px_3px_rgba(245,158,11,0.45)]"
            dangerouslySetInnerHTML={{ __html: starIcon(9, 'currentColor') }}
          />
          <span className="font-medium text-gray-600 dark:text-gray-300">Beste</span>
        </span>
        {chargingStations.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span
              className="w-4 h-4 rounded-md flex items-center justify-center text-white
                         bg-gradient-to-br from-blue-400 to-blue-600
                         shadow-[0_1px_3px_rgba(59,130,246,0.45)]"
              dangerouslySetInnerHTML={{ __html: lightningIcon(9, 'currentColor') }}
            />
            <span className="font-medium text-gray-600 dark:text-gray-300">Ladesäulen</span>
          </span>
        )}
        {h2Stations.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span
              className="w-4 h-4 rounded-md flex items-center justify-center text-white
                         bg-gradient-to-br from-cyan-400 to-cyan-600
                         shadow-[0_1px_3px_rgba(6,182,212,0.45)]"
              dangerouslySetInnerHTML={{ __html: dropletIcon(9, 'currentColor') }}
            />
            <span className="font-medium text-gray-600 dark:text-gray-300">Wasserstoff</span>
          </span>
        )}
        {gasStations.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span
              className="w-4 h-4 rounded-md flex items-center justify-center text-white
                         bg-gradient-to-br from-orange-400 to-orange-600
                         shadow-[0_1px_3px_rgba(249,115,22,0.45)]"
              dangerouslySetInnerHTML={{ __html: flameIcon(9, 'currentColor') }}
            />
            <span className="font-medium text-gray-600 dark:text-gray-300">LPG/CNG</span>
          </span>
        )}
      </div>
    </div>
  );
}
