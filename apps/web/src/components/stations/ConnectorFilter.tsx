// ============================================================
// ConnectorFilter — EV connector type and power filter
// ============================================================

'use client';

import type { ConnectorType, ChargingSpeed } from '@fuelyn/core';
import {
  CONNECTOR_TYPES,
  CONNECTOR_TYPE_LABELS,
  CONNECTOR_TYPE_ICONS,
  CHARGING_SPEED_LABELS,
} from '@fuelyn/core';

interface ConnectorFilterProps {
  selectedConnectors: readonly ConnectorType[];
  onConnectorsChange: (types: ConnectorType[]) => void;
  selectedSpeeds: readonly ChargingSpeed[];
  onSpeedsChange: (speeds: ChargingSpeed[]) => void;
  minPowerKW: number | null;
  onMinPowerChange: (kw: number | null) => void;
}

const POWER_OPTIONS = [
  { value: null, label: 'Alle' },
  { value: 11, label: '≥11 kW' },
  { value: 22, label: '≥22 kW' },
  { value: 50, label: '≥50 kW' },
  { value: 150, label: '≥150 kW' },
  { value: 300, label: '≥300 kW' },
] as const;

const CHARGING_SPEEDS: ChargingSpeed[] = ['ac', 'dc', 'hpc'];

const SPEED_COLORS: Record<ChargingSpeed, { active: string; inactive: string }> = {
  ac: {
    active: 'bg-emerald-600 text-white',
    inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  },
  dc: {
    active: 'bg-green-600 text-white',
    inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  },
  hpc: {
    active: 'bg-lime-600 text-white',
    inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  },
};

export function ConnectorFilter({
  selectedConnectors,
  onConnectorsChange,
  selectedSpeeds,
  onSpeedsChange,
  minPowerKW,
  onMinPowerChange,
}: ConnectorFilterProps) {
  const toggleConnector = (type: ConnectorType) => {
    if (selectedConnectors.includes(type)) {
      onConnectorsChange(selectedConnectors.filter((t) => t !== type));
    } else {
      onConnectorsChange([...selectedConnectors, type]);
    }
  };

  const toggleSpeed = (speed: ChargingSpeed) => {
    if (selectedSpeeds.includes(speed)) {
      onSpeedsChange(selectedSpeeds.filter((s) => s !== speed));
    } else {
      onSpeedsChange([...selectedSpeeds, speed]);
    }
  };

  return (
    <div className="space-y-4">
      {/* Charging Speed */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Ladegeschwindigkeit
        </label>
        <div className="flex gap-2">
          {CHARGING_SPEEDS.map((speed) => (
            <button
              key={speed}
              type="button"
              onClick={() => toggleSpeed(speed)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all
                ${selectedSpeeds.includes(speed) ? SPEED_COLORS[speed].active : SPEED_COLORS[speed].inactive}`}
            >
              {CHARGING_SPEED_LABELS[speed]}
            </button>
          ))}
        </div>
      </div>

      {/* Connector Types */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Steckertyp
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {CONNECTOR_TYPES.filter((t) => t !== 'other').map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => toggleConnector(type)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all
                ${selectedConnectors.includes(type)
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              <span>{CONNECTOR_TYPE_ICONS[type]}</span>
              <span>{CONNECTOR_TYPE_LABELS[type]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Min Power */}
      <div>
        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          Mindestleistung
        </label>
        <div className="flex flex-wrap gap-1.5">
          {POWER_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => onMinPowerChange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                ${minPowerKW === opt.value
                  ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
