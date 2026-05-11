// ============================================================
// StationMap - Premium map with custom price markers
// Uses CartoDB Voyager tiles for a clean, modern look and
// custom HTML markers with animated price bubbles.
// ============================================================

'use client';

import { useEffect, useMemo, useRef, useCallback, useState } from 'react';
import type { MutableRefObject } from 'react';
import { Circle, MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import type { StationRecommendation, ChargingStation, UnifiedStation, UnifiedHydrogenStation, UnifiedGasStation } from '@fuelyn/core';
import { formatPrice, FUEL_TYPE_LABELS, isHydrogenStation, isGasStation } from '@fuelyn/core';
import { useAppStore } from '@/lib/store/app-store';
import { useTranslations } from '@/lib/hooks/use-translations';
import { getBrandConfig } from '@/lib/brand-config';
import { getCachedIcon, priceMarkerKey, chargingMarkerKey, h2MarkerKey, gasMarkerKey, clusterMarkerKey } from '@/lib/utils/marker-cache';
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

// Map style descriptors. Visible label is resolved at render time
// from the active locale via the matching `settings.map*` key, so
// the array carries only the stable id + icon abbreviation.
const MAP_STYLES = [
  { id: 'standard',  labelKey: 'settings.mapStandard',  icon: 'S' },
  { id: 'dark',      labelKey: 'settings.mapDark',      icon: 'D' },
  { id: 'satellite', labelKey: 'settings.mapSatellite', icon: 'Sat' },
  { id: 'terrain',   labelKey: 'settings.mapTerrain',   icon: 'Ter' },
] as const;

function isFiniteCoordinate(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= 180;
}

function getStarSvg(size: number): string {
  return `<svg viewBox="0 0 20 20" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><path d="M10 1.5l2.224 4.507 4.974.723-3.6 3.509.85 4.953L10 13.523l-4.448 2.339.85-4.953-3.6-3.509 4.974-.723L10 1.5z"/></svg>`;
}

type MapStyleId = 'standard' | 'dark' | 'satellite' | 'terrain';

/**
 * Per-basemap palette for the price marker. Each basemap has its
 * own contrast and colour bias, so the holo-card needs a different
 * surface, accent and glow strength to stay legible AND feel like
 * it belongs to that map.
 *
 *   • standard  — light Voyager tiles (warm pastel landmass).
 *                 We keep the marker dark so it pops, but use a
 *                 deeper navy with a softer, less neon cyan glow
 *                 so it harmonises with the warm map palette.
 *   • dark      — CartoCDN dark_all. The original holo look — a
 *                 near-black card with a strong cyan glow and
 *                 visible inner highlights — works best here.
 *   • satellite — Esri imagery. Imagery is busy and saturated, so
 *                 the marker switches to a near-white frosted card
 *                 with a thin slate border for clean separation.
 *   • terrain   — OpenTopoMap (greens/browns, contour lines). A
 *                 muted slate-blue accent reads better against
 *                 the natural palette than pure cyan.
 *
 * The accent colour for semantic states (best / unreachable /
 * tight) is constant across maps so users learn ONE colour code.
 * Only the *default* (no-state) accent and the surface change.
 */
interface MarkerTheme {
  /** Card background gradient (top → bottom). */
  surface: string;
  /** Inner top highlight for the glass effect. */
  innerHighlight: string;
  /** Outer drop-shadow tint that grounds the card on the map. */
  shadowTint: string;
  /** Body text colour (price + brand initials read against this). */
  textColor: string;
  /** Default accent if no semantic override (best/tight/unreachable). */
  defaultAccent: string;
  /** Whether the surface is dark — drives a few inverted styles. */
  isDarkSurface: boolean;
}

const MARKER_THEMES: Record<MapStyleId, MarkerTheme> = {
  standard: {
    // Slightly warmer navy than #0F172A so the card feels native
    // to Voyager's beige landmass instead of "alien".
    surface: 'linear-gradient(180deg, rgba(23,32,52,0.94) 0%, rgba(15,23,42,0.86) 100%)',
    innerHighlight: 'rgba(255,255,255,0.10)',
    shadowTint: 'rgba(15,23,42,0.30)',
    textColor: '#F8FAFC',
    // Indigo-shifted cyan: less neon, blends with Voyager's blue water/roads.
    defaultAccent: '#38BDF8',
    isDarkSurface: true,
  },
  dark: {
    // Almost-black glass — the canonical holo look.
    surface: 'linear-gradient(180deg, rgba(2,6,23,0.94) 0%, rgba(15,23,42,0.82) 100%)',
    innerHighlight: 'rgba(255,255,255,0.14)',
    shadowTint: 'rgba(0,0,0,0.55)',
    textColor: '#F1F5F9',
    defaultAccent: '#22D3EE',
    isDarkSurface: true,
  },
  satellite: {
    // Imagery is saturated; an inverted (light) card cuts through.
    surface: 'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(241,245,249,0.92) 100%)',
    innerHighlight: 'rgba(15,23,42,0.06)',
    shadowTint: 'rgba(0,0,0,0.35)',
    textColor: '#0F172A',
    // Sapphire blue reads well over greens/browns/water.
    defaultAccent: '#2563EB',
    isDarkSurface: false,
  },
  terrain: {
    // Slightly off-white that won't fight OpenTopoMap's beige tiles.
    surface: 'linear-gradient(180deg, rgba(248,250,252,0.96) 0%, rgba(226,232,240,0.92) 100%)',
    innerHighlight: 'rgba(15,23,42,0.05)',
    shadowTint: 'rgba(15,23,42,0.30)',
    textColor: '#0F172A',
    // Muted slate-blue: the contour lines of topo maps already use
    // a teal-ish hue, so we shift slightly cooler to stand out.
    defaultAccent: '#0891B2',
    isDarkSurface: false,
  },
};

function isMapStyleId(s: string): s is MapStyleId {
  return s === 'standard' || s === 'dark' || s === 'satellite' || s === 'terrain';
}

/**
 * Holographic glass marker — futuristic "floating pin" look:
 *   ┌─────────────┐
 *   │   [BR]      │   ← brand initials chip (brand-tinted)
 *   │    ⛽       │   ← simplified fuel-pump icon (accent-coloured)
 *   │ [1,929 €]   │   ← price pill (rounded, high-contrast)
 *   └─────┬───────┘
 *         ▾▾         ← chevrons pointing down
 *         ●          ← halo ring on the ground
 *
 * Accent colour rules (highest priority first):
 *   1) `isBest`                 → amber/gold (the standout pin)
 *   2) `reachability=unreachable` → red (out of range)
 *   3) `reachability=tight`     → yellow (cutting it close)
 *   4) default                  → theme's defaultAccent (varies
 *                                 per map style, see MARKER_THEMES)
 *
 * The card is anchored so its halo sits on the lat/lng coordinate
 * — `iconAnchor` is calibrated to the rendered card height.
 */
function createPriceMarkerIcon(
  price: number | null,
  isBest: boolean,
  isOpen: boolean,
  reachability: 'safe' | 'tight' | 'unreachable',
  brand: string,
  mapStyle: string,
): L.DivIcon {
  const brandCfg = getBrandConfig(brand);
  const noPrice = price == null;
  const theme = MARKER_THEMES[isMapStyleId(mapStyle) ? mapStyle : 'standard'];

  // ─── Accent colour ───────────────────────────────────────────
  // Best/tight/unreachable use a fixed semantic palette across all
  // map styles so users learn one colour code; only the *default*
  // accent shifts per basemap (see MARKER_THEMES).
  const accent = isBest
    ? '#F59E0B' // amber-500 — slightly warmer than 400, plays nice with both light + dark surfaces
    : reachability === 'unreachable'
      ? '#EF4444' // red-500
      : reachability === 'tight'
        ? '#F59E0B' // we keep tight on amber too, but visually distinct via NO best-star
        : theme.defaultAccent;
  const accentSoft = `${accent}55`;
  const accentTrace = `${accent}80`;
  // Soft variant for the price-pill border on dark surfaces — too
  // saturated a colour starts to bleed; a 33-alpha keeps it elegant.
  const pillBorder = theme.isDarkSurface ? `${accent}55` : `${accent}66`;

  const opacity = !isOpen ? 0.55 : noPrice ? 0.78 : 1;
  // Glow tuning: best/unreachable amplify; default is restrained so
  // a city full of stations doesn't feel chaotic.
  const glowStrength = isBest ? 1.4 : reachability === 'unreachable' ? 1.0 : 0.7;
  const glow = theme.isDarkSurface
    ? `0 0 ${Math.round(10 * glowStrength)}px ${accent}${Math.round(120 * glowStrength).toString(16).padStart(2, '0')},
       0 0 ${Math.round(22 * glowStrength)}px ${accent}33,
       0 4px 12px ${theme.shadowTint}`
    : `0 0 ${Math.round(8 * glowStrength)}px ${accent}${Math.round(80 * glowStrength).toString(16).padStart(2, '0')},
       0 6px 16px ${theme.shadowTint}`;

  // Pump-icon SVG — accent-stroked, lightly traced. The drop-shadow
  // colour matches the accent so the icon reads as "lit" by it.
  const pumpSvg = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="${accent}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 3px ${accentSoft})">
    <rect x="4" y="3" width="9" height="17" rx="1.5"/>
    <path d="M6 7h5"/>
    <path d="M6 10h5"/>
    <path d="M13 9l3 0a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0v-7l-2-2"/>
  </svg>`;

  // Best-option star — its border colour follows the surface so it
  // doesn't look pasted on regardless of light/dark theme.
  const starBorder = theme.isDarkSurface ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.95)';
  const bestStarHtml = isBest ? `
    <span style="
      position:absolute; top:-6px; right:-6px;
      width:16px; height:16px;
      background:linear-gradient(135deg,#FBBF24 0%,#F59E0B 100%);
      border-radius:50%;
      border:2px solid ${starBorder};
      display:flex; align-items:center; justify-content:center;
      box-shadow:0 0 8px ${accent}AA;
      color:white;
      z-index:2;
    ">${getStarSvg(8)}</span>` : '';

  // Price-pill colours: on dark surfaces we keep the white pill for
  // contrast; on light surfaces an inverted (deep-navy) pill reads
  // better and looks more refined.
  const pillBg = theme.isDarkSurface
    ? 'linear-gradient(180deg, #FFFFFF 0%, #F1F5F9 100%)'
    : 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)';
  const pillTextColor = theme.isDarkSurface ? '#0F172A' : '#F8FAFC';
  const pillEuroColor = theme.isDarkSurface ? '#64748B' : '#94A3B8';
  const pillNaColor = theme.isDarkSurface ? '#94A3B8' : '#94A3B8';
  const pillInsetHighlight = theme.isDarkSurface
    ? 'inset 0 1px 0 rgba(255,255,255,0.7)'
    : 'inset 0 1px 0 rgba(255,255,255,0.10)';

  // Brand chip: keep the per-brand colour so the user can spot Aral
  // vs. Shell vs. JET at a glance. On light surfaces we strengthen
  // the chip's outline so the brand colour doesn't bleed visually.
  const brandChipShadow = theme.isDarkSurface
    ? `0 1px 4px ${brandCfg.color}55, inset 0 1px 0 rgba(255,255,255,0.18)`
    : `0 1px 3px ${brandCfg.color}66, inset 0 1px 0 rgba(255,255,255,0.20), 0 0 0 0.5px rgba(15,23,42,0.08)`;

  return L.divIcon({
    // The `is-best` modifier triggers a slow gold-halo pulse keyframe
    // (see globals.css). Use a hover/active aware class chain so the
    // CSS layer can animate without us having to inline keyframes.
    className: `tp-marker${isBest ? ' tp-marker--best' : ''}${priceTier === 'low' ? ' tp-marker--cheap' : ''}${isSelected ? ' tp-marker--selected' : ''}`,
    html: `
      <div class="tp-marker-bubble" style="
        position:relative;
        opacity:${opacity};
        font-family:'Inter',system-ui,-apple-system,sans-serif;
        cursor:pointer;
        transform-origin:bottom center;
        transition:transform 0.18s cubic-bezier(0.4,0,0.2,1);
        width:78px;
      ">
        <!-- Glass card -->
        <div style="
          position:relative;
          padding:6px 8px 7px;
          border-radius:14px;
          border:1px solid ${accentTrace};
          background:
            radial-gradient(120% 80% at 50% 0%, ${accent}14 0%, transparent 65%),
            ${theme.surface};
          backdrop-filter:blur(6px);
          -webkit-backdrop-filter:blur(6px);
          box-shadow:${glow}, inset 0 1px 0 ${theme.innerHighlight};
          color:${theme.textColor};
          display:flex; flex-direction:column; align-items:center; gap:3px;
        ">
          ${bestStarHtml}

          <!-- Brand chip -->
          <span style="
            align-self:stretch;
            display:flex; align-items:center; justify-content:center;
            height:14px;
            border-radius:5px;
            background:${brandCfg.gradient};
            color:${brandCfg.textColor};
            font-size:${brandCfg.initials.length > 2 ? '7px' : '9px'};
            font-weight:800;
            letter-spacing:${brandCfg.initials.length > 2 ? '0' : '-0.2px'};
            box-shadow:${brandChipShadow};
            text-shadow:${brandCfg.textColor === '#FFFFFF' ? '0 1px 2px rgba(0,0,0,0.25)' : 'none'};
            text-transform:uppercase;
          ">${brandCfg.initials}</span>

          <!-- Pump icon -->
          <span style="display:flex; line-height:0;">${pumpSvg}</span>

          <!-- Price pill -->
          <span style="
            display:inline-flex; align-items:center; justify-content:center;
            min-width:56px;
            padding:2px 9px;
            border-radius:999px;
            border:1px solid ${pillBorder};
            background:${pillBg};
            color:${pillTextColor};
            font-size:12px;
            font-weight:800;
            letter-spacing:-0.3px;
            box-shadow:${pillInsetHighlight}, 0 0 6px ${accent}29;
            white-space:nowrap;
          ">${noPrice
            ? `<span style="color:${pillNaColor};font-weight:600;">n/a</span>`
            : `${priceText}<span style="font-weight:600;color:${pillEuroColor};margin-left:2px;">&nbsp;€</span>`
          }</span>
        </div>

        <!-- Pointer chevrons -->
        <div style="
          width:14px; margin:2px auto 0;
          display:flex; flex-direction:column; align-items:center;
          color:${accent};
        ">
          <svg viewBox="0 0 12 6" width="14" height="5" fill="none" stroke="${accent}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 2px ${accentSoft})">
            <path d="M2 1l4 4 4-4"/>
          </svg>
          <svg viewBox="0 0 12 6" width="14" height="5" fill="none" stroke="${accent}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" style="margin-top:-2px;opacity:0.55;filter:drop-shadow(0 0 2px ${accentSoft})">
            <path d="M2 1l4 4 4-4"/>
          </svg>
        </div>

        <!-- Ground halo -->
        <div style="
          width:20px; height:6px; margin:1px auto 0;
          border-radius:50%;
          background:radial-gradient(50% 100% at 50% 50%, ${accent}B0 0%, ${accent}30 55%, transparent 100%);
          box-shadow:0 0 8px ${accentSoft};
        "></div>
      </div>
    `,
    iconSize: [0, 0],
    // Anchor: card 70 + chevrons 12 + halo 6 ≈ 88; centre of halo
    // sits on lat/lng. 39 horizontal → centre of 78 px width.
    iconAnchor: [39, 88],
    popupAnchor: [0, -80],
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

/**
 * LongPressPinHandler — captures a long-press (touch) or right-
 * click (mouse) anywhere on the map and invokes the callback with
 * the lat/lng coordinates. Lets the user "drop a pin here" to make
 * any spot on the map their search centre, without typing an
 * address into the search bar.
 *
 * Implementation note: Leaflet's `contextmenu` event fires on both
 * gestures, so a single listener covers desktop + mobile cleanly.
 * preventDefault would normally suppress the browser's native
 * right-click menu, but Leaflet already handles that internally.
 */
function LongPressPinHandler({
  onDropPin,
}: {
  onDropPin: (coords: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    contextmenu: (e) => {
      onDropPin({ lat: e.latlng.lat, lng: e.latlng.lng });
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
    // Tier-based size + color: density translates into visual weight.
    //   small (<10):   blue    — calm, expected count
    //   medium (10-49): indigo — meaningful cluster
    //   large (50+):   violet  — must-zoom-in territory
    const tier = count < 10 ? 'small' : count < 50 ? 'medium' : 'large';
    const size = tier === 'small' ? 42 : tier === 'medium' ? 50 : 58;
    const fontSize = tier === 'small' ? 15 : tier === 'medium' ? 14 : 13;

    const grad =
      tier === 'small'
        ? 'linear-gradient(135deg, #3B8AFF 0%, #2575EA 55%, #1747B8 100%)'
        : tier === 'medium'
          ? 'linear-gradient(135deg, #818CF8 0%, #6366F1 55%, #3730A3 100%)'
          : 'linear-gradient(135deg, #C084FC 0%, #A855F7 55%, #6B21A8 100%)';

    const haloColor =
      tier === 'small'
        ? '37,117,234'
        : tier === 'medium'
          ? '99,102,241'
          : '168,85,247';

    return L.divIcon({
      className: 'tp-cluster',
      html: `
        <div style="
          position: relative;
          width: ${size}px; height: ${size}px;
          border-radius: 50%;
          background: ${grad};
          color: white;
          display: flex; align-items: center; justify-content: center;
          font-family: 'Inter', system-ui, sans-serif;
          font-size: ${fontSize}px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.5px;
          border: 2.5px solid rgba(255,255,255,0.95);
          box-shadow:
            0 0 0 4px rgba(${haloColor},0.16),
            0 0 0 8px rgba(${haloColor},0.08),
            0 6px 20px rgba(${haloColor},0.45),
            inset 0 1.5px 0 rgba(255,255,255,0.32),
            inset 0 -1px 4px rgba(0,0,0,0.10);
          text-shadow: 0 1px 2px rgba(0,0,0,0.25);
          cursor: pointer;
          transition: transform 0.2s cubic-bezier(0.34,1.56,0.64,1);
          overflow: hidden;
        ">
          <span style="position:relative; z-index:2;">${count}</span>
          <span aria-hidden="true" style="
            position: absolute;
            inset: 0;
            border-radius: 50%;
            background: radial-gradient(circle at 32% 28%, rgba(255,255,255,0.35) 0%, transparent 55%);
            pointer-events: none;
          "></span>
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
  const { t } = useTranslations();
  const fuelType = useAppStore((s) => s.filter.fuelType);
  const userLocation = useAppStore((s) => s.userLocation);
  const userLocationAccuracy = useAppStore((s) => s.userLocationAccuracy);
  const setUserLocation = useAppStore((s) => s.setUserLocation);
  // Toast shown briefly after a long-press / right-click drops a
  // pin. Auto-clears after a couple of seconds so it doesn't
  // linger across map interactions.
  const [pinToast, setPinToast] = useState<string | null>(null);
  const handleDropPin = useCallback(
    (coords: { lat: number; lng: number }) => {
      setUserLocation(coords);
      setMapCenter(null);
      setMapRadiusKm(5);
      // Concatenated rather than templated so the key only carries
      // the translatable lead-in; the coordinates stay locale-neutral
      // (no need for separate fr/en/etc. number formatters here).
      setPinToast(
        `${t('map.pinDropToastPrefix')} (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`,
      );
    },
    [setUserLocation, t],
  );
  // Auto-fade the toast after 2.5 s — short enough to not be
  // intrusive, long enough to read.
  useEffect(() => {
    if (!pinToast) return;
    const t = setTimeout(() => setPinToast(null), 2500);
    return () => clearTimeout(t);
  }, [pinToast]);
  const liveTracking = useAppStore((s) => s.liveTracking);
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
        {/*
          Long-press / right-click → "drop a pin here" so the user
          can jump the search centre to anywhere on the map without
          typing an address. Useful for "what's around this spot?"
          exploration.
        */}
        <LongPressPinHandler onDropPin={handleDropPin} />

        {userLocation && (
          <>
            {/*
              Accuracy circle — visualises the GPS uncertainty so
              the user understands why the dot might not sit on the
              right house number. Hidden for tiny radii (≤8 m)
              where the circle would just clutter the dot. Clamped
              at 1500 m so a poor fix doesn't fill the entire
              viewport and obscure stations. Stronger fill when
              live tracking is on so the radius reads as "live
              data", not a stale fix.
            */}
            {userLocationAccuracy != null &&
              Number.isFinite(userLocationAccuracy) &&
              userLocationAccuracy > 8 && (
                <Circle
                  center={[userLocation.lat, userLocation.lng]}
                  radius={Math.min(userLocationAccuracy, 1500)}
                  pathOptions={{
                    color: '#2575EA',
                    weight: 1,
                    opacity: liveTracking ? 0.55 : 0.35,
                    fillColor: '#2575EA',
                    fillOpacity: liveTracking ? 0.10 : 0.06,
                  }}
                  interactive={false}
                />
              )}
            <Marker
              position={[userLocation.lat, userLocation.lng]}
              icon={userIcon}
              interactive={false}
            />
          </>
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
              mapStyle,
            );
            const icon = getCachedIcon(cacheKey, () =>
              createPriceMarkerIcon(
                price,
                rec.isBestOption,
                rec.station.isOpen,
                rec.reachabilityStatus,
                rec.station.brand,
                mapStyle,
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
                        {cs.operator || t('map.chargingFallbackName')}
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
                    {cs.isOperational ? t('map.chargingOperational') : t('map.chargingOutOfService')}
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
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>{t('map.hydrogenLabel')}</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: '#0F172A' }}>
                      {h2.h2PricePerKg != null ? `${h2.h2PricePerKg.toFixed(2)} €/kg` : '—'}
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
                    {h2.h2Available ? t('map.h2Available') : t('map.h2Unavailable')}
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
                        {gs.operator || gs.name || t('map.gasFallbackName')}
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
                    {gs.isOpen ? t('station.open') : t('station.closed')}
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
          aria-label={t('map.zoomIn')}
          title={t('map.zoomIn')}
        >
          <svg className="w-5 h-5 text-gray-700 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" d="M12 6v12M6 12h12" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => mapRef.current?.zoomOut()}
          className={btnClass}
          aria-label={t('map.zoomOut')}
          title={t('map.zoomOut')}
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
          aria-label={userLocation ? t('map.centerOnLocation') : t('location.useCurrentLocation')}
          title={userLocation ? t('map.centerOnLocation') : t('location.useCurrentLocation')}
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
            aria-label={t('map.refreshPrices')}
            title={t('map.refreshPrices')}
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
            aria-label={t('map.styleAria')}
            title={t('map.styleAria')}
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
                  <span>{t(style.labelKey)}</span>
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
          {t('map.stations')}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="w-3.5 h-3.5 rounded bg-brand-600 text-white flex items-center justify-center"
            dangerouslySetInnerHTML={{ __html: getStarSvg(8) }}
          />
          {t('map.legendBest')}
        </span>
        {chargingStations.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded text-white text-[8px] flex items-center justify-center font-bold" style={{ background: '#3b82f6' }}>&#9889;</span>
            {t('map.legendCharging')}
          </span>
        )}
        {h2Stations.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded text-white text-[8px] flex items-center justify-center font-bold" style={{ background: '#06b6d4' }}>&#128167;</span>
            {t('map.legendHydrogen')}
          </span>
        )}
        {gasStations.length > 0 && (
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded text-white text-[8px] flex items-center justify-center font-bold" style={{ background: '#f97316' }}>&#128293;</span>
            {t('map.legendGas')}
          </span>
        )}
      </div>

      {/*
        Drop-pin confirmation toast — appears top-centre after a
        long-press / right-click moves the search centre. Auto-
        clears after 2.5 s. z-[1100] to sit above the map controls.
      */}
      {pinToast && (
        <div
          role="status"
          aria-live="polite"
          className="absolute top-3 left-1/2 -translate-x-1/2 z-[1100]
                     px-3 py-2 rounded-full bg-gray-900/95 dark:bg-gray-100/95
                     text-white dark:text-gray-900
                     text-xs font-medium shadow-[var(--shadow-lg)]
                     flex items-center gap-2 animate-fade-in-up"
        >
          <svg className="w-3.5 h-3.5 text-brand-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" />
          </svg>
          {pinToast}
        </div>
      )}
    </div>
  );
}
