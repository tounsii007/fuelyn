// ============================================================
// StationTypeIcon — Visual icon for station/energy types
// ============================================================

'use client';

import type { StationType, EnergyType } from '@fuelyn/core';

interface StationTypeIconProps {
  type: StationType;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_MAP = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
} as const;

const STATION_COLORS: Record<StationType, string> = {
  fuel: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  charging: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  hydrogen: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  gas: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

const STATION_ICONS: Record<StationType, string> = {
  fuel: '⛽',
  charging: '⚡',
  hydrogen: '💧',
  gas: '🔥',
};

export function StationTypeIcon({ type, size = 'md', className = '' }: StationTypeIconProps) {
  return (
    <div
      className={`inline-flex items-center justify-center rounded-lg font-bold
        ${SIZE_MAP[size]} ${STATION_COLORS[type]} ${className}`}
    >
      {STATION_ICONS[type]}
    </div>
  );
}

// ─── Energy Type Badge ──────────────────────────────────────

interface EnergyTypeBadgeProps {
  type: EnergyType;
  size?: 'sm' | 'md';
  className?: string;
}

const ENERGY_COLORS: Record<EnergyType, string> = {
  diesel: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  e5: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  e10: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  super_plus: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  lpg: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  cng: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  lng: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  h2: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  ev_ac: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  ev_dc: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  ev_hpc: 'bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-400',
};

const ENERGY_SHORT_LABELS: Record<EnergyType, string> = {
  diesel: 'Diesel',
  e5: 'E5',
  e10: 'E10',
  super_plus: 'S+',
  lpg: 'LPG',
  cng: 'CNG',
  lng: 'LNG',
  h2: 'H₂',
  ev_ac: 'AC',
  ev_dc: 'DC',
  ev_hpc: 'HPC',
};

export function EnergyTypeBadge({ type, size = 'sm', className = '' }: EnergyTypeBadgeProps) {
  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full
        ${size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}
        ${ENERGY_COLORS[type]} ${className}`}
    >
      {ENERGY_SHORT_LABELS[type]}
    </span>
  );
}
