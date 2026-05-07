// ============================================================
// PriceTag — Styled fuel price display
// Shows price with superscript trailing digit, German convention.
// ============================================================

'use client';

import { splitPrice } from '@tankpilot/core';
import type { FuelType } from '@tankpilot/core';

interface PriceTagProps {
  price: number | null;
  fuelType?: FuelType;
  size?: 'sm' | 'md' | 'lg';
  highlight?: boolean;
  className?: string;
}

const FUEL_COLORS: Record<FuelType, string> = {
  diesel: 'text-fuel-diesel',
  e5: 'text-fuel-e5',
  e10: 'text-fuel-e10',
};

const SIZE_CLASSES = {
  sm: { main: 'text-base font-bold', trailing: 'text-xs', currency: 'text-xs ml-0.5' },
  md: { main: 'text-xl font-bold', trailing: 'text-sm', currency: 'text-sm ml-1' },
  lg: { main: 'text-price-main', trailing: 'text-price-super', currency: 'text-base ml-1' },
};

export function PriceTag({ price, fuelType, size = 'md', highlight, className = '' }: PriceTagProps) {
  const { main, trailing, currency } = splitPrice(price);
  const sizeClasses = SIZE_CLASSES[size];
  const colorClass = fuelType ? FUEL_COLORS[fuelType] : '';

  if (price == null) {
    return (
      <span className={`${sizeClasses.main} text-gray-400 dark:text-gray-500 ${className}`}>
        --
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-baseline tabular-nums ${colorClass} ${className} ${
        highlight ? 'animate-price-flash rounded-md px-1 -mx-1' : ''
      }`}
    >
      <span className={sizeClasses.main}>{main}</span>
      <sup className={`${sizeClasses.trailing} -top-1.5 relative`}>{trailing}</sup>
      <span className={`${sizeClasses.currency} text-gray-500 dark:text-gray-400 font-normal`}>
        {currency}
      </span>
    </span>
  );
}
