// ============================================================
// EnergyTypeChips — Horizontal chip selector for energy types
// ============================================================

'use client';

import { useCallback } from 'react';
import type { EnergyType, EnergyCategory } from '@tankpilot/core';
import {
  ENERGY_TYPE_LABELS,
  ENERGY_TYPE_ICONS,
  ENERGY_CATEGORY_LABELS,
  getEnergyTypesByCategory,
} from '@tankpilot/core';

interface EnergyTypeChipsProps {
  selected: readonly EnergyType[];
  onChange: (types: EnergyType[]) => void;
  /** Show category group headers. */
  grouped?: boolean;
  /** Compact mode for inline use. */
  compact?: boolean;
}

const CATEGORY_ORDER: EnergyCategory[] = ['fuel', 'gas', 'hydrogen', 'electric'];

const CATEGORY_COLORS: Record<EnergyCategory, { active: string; inactive: string }> = {
  fuel: {
    active: 'bg-blue-600 text-white shadow-sm shadow-blue-200 dark:shadow-blue-900/30',
    inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
  },
  gas: {
    active: 'bg-orange-600 text-white shadow-sm shadow-orange-200 dark:shadow-orange-900/30',
    inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
  },
  hydrogen: {
    active: 'bg-cyan-600 text-white shadow-sm shadow-cyan-200 dark:shadow-cyan-900/30',
    inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
  },
  electric: {
    active: 'bg-emerald-600 text-white shadow-sm shadow-emerald-200 dark:shadow-emerald-900/30',
    inactive: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700',
  },
};

export function EnergyTypeChips({ selected, onChange, grouped = false, compact = false }: EnergyTypeChipsProps) {
  const toggle = useCallback(
    (type: EnergyType) => {
      if (selected.includes(type)) {
        onChange(selected.filter((t) => t !== type));
      } else {
        onChange([...selected, type]);
      }
    },
    [selected, onChange],
  );

  const toggleCategory = useCallback(
    (category: EnergyCategory) => {
      const categoryTypes = getEnergyTypesByCategory(category);
      const allSelected = categoryTypes.every((t) => selected.includes(t));
      if (allSelected) {
        onChange(selected.filter((t) => !categoryTypes.includes(t)));
      } else {
        const merged = new Set([...selected, ...categoryTypes]);
        onChange(Array.from(merged));
      }
    },
    [selected, onChange],
  );

  if (grouped) {
    return (
      <div className="space-y-3">
        {CATEGORY_ORDER.map((category) => {
          const types = getEnergyTypesByCategory(category);
          const categorySelected = types.some((t) => selected.includes(t));

          return (
            <div key={category}>
              <div className="flex items-center gap-2 mb-1.5">
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md transition-colors
                    ${categorySelected
                      ? CATEGORY_COLORS[category].active
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                    }`}
                >
                  {ENERGY_CATEGORY_LABELS[category]}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {types.map((type) => (
                  <ChipButton
                    key={type}
                    type={type}
                    isSelected={selected.includes(type)}
                    onClick={() => toggle(type)}
                    compact={compact}
                    category={category}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Flat layout
  return (
    <div className="flex flex-wrap gap-1.5">
      {CATEGORY_ORDER.flatMap((category) =>
        getEnergyTypesByCategory(category).map((type) => (
          <ChipButton
            key={type}
            type={type}
            isSelected={selected.includes(type)}
            onClick={() => toggle(type)}
            compact={compact}
            category={category}
          />
        )),
      )}
    </div>
  );
}

interface ChipButtonProps {
  type: EnergyType;
  isSelected: boolean;
  onClick: () => void;
  compact: boolean;
  category: EnergyCategory;
}

function ChipButton({ type, isSelected, onClick, compact, category }: ChipButtonProps) {
  const colors = CATEGORY_COLORS[category];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full font-medium transition-all
        ${compact ? 'px-2 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'}
        ${isSelected ? colors.active : colors.inactive}`}
    >
      <span className={compact ? 'text-xs' : 'text-sm'}>{ENERGY_TYPE_ICONS[type]}</span>
      <span>{compact ? ENERGY_TYPE_LABELS[type].split(' ')[0] : ENERGY_TYPE_LABELS[type]}</span>
    </button>
  );
}
