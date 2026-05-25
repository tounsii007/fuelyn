// ============================================================
// Marker SVG Helpers — Crisp vector icons + speech-bubble notch
// ============================================================
// Used by StationMap to render markers without OS-dependent emoji
// (the previous &#9889; / &#128167; / &#128293; entities rendered
// inconsistently across iOS, Android, Windows and Linux). Inline
// SVG paths give pixel-identical results everywhere and scale
// cleanly on retina displays.

/**
 * Downward-pointing speech-bubble notch (≙ tail). Replaces the old
 * 2px stem + 7px dot — a triangle pointer makes the marker read as
 * a single coherent shape (Apple Maps / Mapbox Studio style) rather
 * than a "balloon on a stick".
 *
 * The geographic anchor lines up with the triangle's apex.
 */
export function notchSvg(fill: string, stroke: string): string {
  return `
    <svg width="16" height="9" viewBox="0 0 16 9"
         style="display:block;margin:-1px auto 0;filter:drop-shadow(0 1px 1.5px rgba(15,23,42,0.20))"
         aria-hidden="true">
      <path d="M 8 8.5 L 0.75 0.75 L 15.25 0.75 Z"
            fill="${fill}" stroke="${stroke}"
            stroke-width="1.25" stroke-linejoin="round"/>
    </svg>`;
}

/**
 * Soft elliptical ground shadow rendered immediately below the
 * notch tip. Gives the marker a sense of altitude — the same trick
 * Apple Maps uses for its annotation pins. Subtle enough to not
 * pollute dense maps but enough to read as 3D in calm areas.
 */
export function groundShadowDiv(): string {
  return `<div aria-hidden="true" style="
    width: 18px; height: 4px;
    background: radial-gradient(ellipse at center, rgba(15,23,42,0.22) 0%, transparent 70%);
    margin: 1px auto 0;
    border-radius: 50%;
    pointer-events: none;
  "></div>`;
}

/** Lightning bolt — EV charging marker. */
export function lightningIcon(size: number, color: string = 'currentColor'): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"
              fill="${color}" aria-hidden="true">
    <path d="M13 2L4 14h7l-2 8 9-12h-7l2-8z"/>
  </svg>`;
}

/** Droplet — hydrogen (H₂) marker. */
export function dropletIcon(size: number, color: string = 'currentColor'): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"
              fill="${color}" aria-hidden="true">
    <path d="M12 2.5s-6.5 7.6-6.5 12.2c0 3.6 2.9 6.5 6.5 6.5s6.5-2.9 6.5-6.5C18.5 10.1 12 2.5 12 2.5z"/>
  </svg>`;
}

/** Flame — LPG/CNG gas marker. */
export function flameIcon(size: number, color: string = 'currentColor'): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}"
              fill="${color}" aria-hidden="true">
    <path d="M12 2c.3 4-2.5 6-2.5 9.5 0 .8.4 1.6 1 2-1.3-.1-2.5-1.5-2.5-3.3-2 1.7-3 4-3 6.3 0 3.6 3 6.5 7 6.5s7-2.9 7-6.5c0-5-4-9-7-14.5z"/>
  </svg>`;
}

/** Star — best-option crown badge. */
export function starIcon(size: number, color: string = 'currentColor'): string {
  return `<svg viewBox="0 0 20 20" width="${size}" height="${size}"
              fill="${color}" aria-hidden="true">
    <path d="M10 1.5l2.224 4.507 4.974.723-3.6 3.509.85 4.953L10 13.523l-4.448 2.339.85-4.953-3.6-3.509 4.974-.723L10 1.5z"/>
  </svg>`;
}

/**
 * Brand-chip sheen overlay. Identical CSS gradient used inside the
 * price bubble's brand chip and the no-price compact chip, exported
 * here so we don't repeat the linear-gradient string in three places.
 */
export const CHIP_SHEEN_GRADIENT =
  'linear-gradient(135deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.04) 45%, rgba(0,0,0,0.10) 100%)';
