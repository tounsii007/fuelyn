// ============================================================
// CountryFlag — inline SVG flag icons.
//
// We render flags as SVG instead of Unicode regional-indicator
// emoji because Windows (Edge, Chrome on Win11) does NOT have a
// flag font and renders 🇩🇪 as the literal letter pair "DE".
// SVG looks identical on every OS and stays sharp on retina.
//
// Each flag is hand-crafted with a 4:3 aspect ratio and rounded
// corners, sized via Tailwind utility classes.
// ============================================================

import type { SVGProps } from 'react';

export type FlagCode = 'DE' | 'GB' | 'EN' | 'US' | 'AT' | 'CH' | 'FR' | 'IT' | 'NL' | 'PL';

export interface CountryFlagProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  readonly code: FlagCode;
  readonly title?: string;
}

export function CountryFlag({ code, title, className, ...rest }: CountryFlagProps) {
  return (
    <svg
      viewBox="0 0 60 45"
      className={['inline-block rounded-[3px] overflow-hidden shadow-[0_0_0_1px_rgba(0,0,0,0.08)]', className].filter(Boolean).join(' ')}
      role="img"
      aria-label={title ?? code}
      preserveAspectRatio="xMidYMid slice"
      {...rest}
    >
      {title && <title>{title}</title>}
      <FlagBody code={code === 'EN' ? 'GB' : code} />
    </svg>
  );
}

function FlagBody({ code }: { code: FlagCode }) {
  switch (code) {
    case 'DE':
      // Black / red / gold — equal horizontal stripes
      return (
        <>
          <rect width="60" height="15" y="0" fill="#000000" />
          <rect width="60" height="15" y="15" fill="#DD0000" />
          <rect width="60" height="15" y="30" fill="#FFCE00" />
        </>
      );
    case 'GB':
      // Union Jack — simplified but recognisable
      return (
        <>
          <rect width="60" height="45" fill="#012169" />
          <path d="M0 0 L60 45 M60 0 L0 45" stroke="#FFFFFF" strokeWidth="9" />
          <path d="M0 0 L60 45 M60 0 L0 45" stroke="#C8102E" strokeWidth="3" />
          <path d="M30 0 V45 M0 22.5 H60" stroke="#FFFFFF" strokeWidth="15" />
          <path d="M30 0 V45 M0 22.5 H60" stroke="#C8102E" strokeWidth="9" />
        </>
      );
    case 'US':
      // Stars and Stripes — 13 stripes, blue canton with simplified
      // star field (a tiled pattern is unnecessary at icon size).
      return (
        <>
          <rect width="60" height="45" fill="#FFFFFF" />
          {/* 13 horizontal stripes (red on rows 0,2,4,6,8,10,12) */}
          {[0, 2, 4, 6, 8, 10, 12].map((i) => (
            <rect key={i} x="0" y={(i * 45) / 13} width="60" height={45 / 13} fill="#B22234" />
          ))}
          {/* Blue canton (covers top 7 stripes ~24.23) */}
          <rect x="0" y="0" width="24" height={(7 * 45) / 13} fill="#3C3B6E" />
          {/* Star cluster — single SVG circle row stand-in for 50 stars */}
          {[...Array(5)].map((_, row) =>
            [...Array(row % 2 === 0 ? 6 : 5)].map((_, col) => (
              <circle
                key={`${row}-${col}`}
                cx={2.5 + col * 4 + (row % 2 === 1 ? 2 : 0)}
                cy={2 + row * 4.5}
                r="0.9"
                fill="#FFFFFF"
              />
            )),
          )}
        </>
      );
    case 'AT':
      return (
        <>
          <rect width="60" height="15" y="0" fill="#ED2939" />
          <rect width="60" height="15" y="15" fill="#FFFFFF" />
          <rect width="60" height="15" y="30" fill="#ED2939" />
        </>
      );
    case 'CH':
      return (
        <>
          <rect width="60" height="45" fill="#DA291C" />
          <rect x="25" y="11" width="10" height="23" fill="#FFFFFF" />
          <rect x="18.5" y="17.5" width="23" height="10" fill="#FFFFFF" />
        </>
      );
    case 'FR':
      return (
        <>
          <rect width="20" height="45" x="0" fill="#002395" />
          <rect width="20" height="45" x="20" fill="#FFFFFF" />
          <rect width="20" height="45" x="40" fill="#ED2939" />
        </>
      );
    case 'IT':
      return (
        <>
          <rect width="20" height="45" x="0" fill="#009246" />
          <rect width="20" height="45" x="20" fill="#FFFFFF" />
          <rect width="20" height="45" x="40" fill="#CE2B37" />
        </>
      );
    case 'NL':
      return (
        <>
          <rect width="60" height="15" y="0" fill="#AE1C28" />
          <rect width="60" height="15" y="15" fill="#FFFFFF" />
          <rect width="60" height="15" y="30" fill="#21468B" />
        </>
      );
    case 'PL':
      return (
        <>
          <rect width="60" height="22.5" y="0" fill="#FFFFFF" />
          <rect width="60" height="22.5" y="22.5" fill="#DC143C" />
        </>
      );
    default:
      return <rect width="60" height="45" fill="#888" />;
  }
}
