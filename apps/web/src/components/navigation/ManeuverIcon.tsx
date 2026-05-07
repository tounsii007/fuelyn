// ============================================================
// ManeuverIcon — SVG turn arrows for navigation instructions
// ============================================================

'use client';

import type { ManeuverType } from '@fuelyn/core';

interface ManeuverIconProps {
  type: ManeuverType;
  className?: string;
}

export function ManeuverIcon({ type, className = 'w-8 h-8' }: ManeuverIconProps) {
  const stroke = 'currentColor';
  const sw = 2.5;

  switch (type) {
    case 'turn-left':
    case 'end-of-road-left':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6H9a4 4 0 0 0-4 4v8" />
          <path d="M12 3L9 6l3 3" />
        </svg>
      );

    case 'turn-right':
    case 'end-of-road-right':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6h6a4 4 0 0 1 4 4v8" />
          <path d="M12 3l3 3-3 3" />
        </svg>
      );

    case 'turn-slight-left':
    case 'fork-left':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 18V10L8 5" />
          <path d="M8 9V5h4" />
        </svg>
      );

    case 'turn-slight-right':
    case 'fork-right':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 18V10l6-5" />
          <path d="M16 9V5h-4" />
        </svg>
      );

    case 'turn-sharp-left':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 18V12L8 8" />
          <path d="M11 5L8 8l3 3" />
        </svg>
      );

    case 'turn-sharp-right':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 18V12l10-4" />
          <path d="M13 5l3 3-3 3" />
        </svg>
      );

    case 'uturn':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 14V7a4 4 0 0 1 8 0v10" />
          <path d="M6 11l3 3 3-3" />
        </svg>
      );

    case 'roundabout':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="10" r="4" />
          <path d="M12 14v6" />
          <path d="M9 7.5L7 5" />
        </svg>
      );

    case 'merge':
    case 'on-ramp':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v16" />
          <path d="M6 8l6-4" />
          <path d="M18 8l-6-4" />
        </svg>
      );

    case 'off-ramp':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 4v8l6 6" />
          <path d="M15 17h3v-3" />
        </svg>
      );

    case 'arrive':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      );

    // depart, continue, unknown
    default:
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 19V5" />
          <path d="M9 8l3-3 3 3" />
        </svg>
      );
  }
}
