// ============================================================
// BrandBadge — Modern brand icon with gradient and glow
// ============================================================

'use client';

import { getBrandConfig } from '@/lib/brand-config';

interface BrandBadgeProps {
  brand: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { box: 'w-7 h-7', text: 'text-[9px]', radius: 'rounded-lg' },
  md: { box: 'w-9 h-9', text: 'text-[11px]', radius: 'rounded-xl' },
  lg: { box: 'w-11 h-11', text: 'text-xs', radius: 'rounded-xl' },
} as const;

export function BrandBadge({ brand, size = 'md', className = '' }: BrandBadgeProps) {
  const config = getBrandConfig(brand);
  const s = SIZES[size];

  return (
    <div
      className={`${s.box} ${s.radius} flex items-center justify-center flex-shrink-0 relative overflow-hidden ${className}`}
      style={{
        background: config.gradient,
        boxShadow: `0 2px 8px ${config.color}40, inset 0 1px 0 rgba(255,255,255,0.15)`,
      }}
      title={brand}
    >
      {/* Shine overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%, rgba(0,0,0,0.05) 100%)',
        }}
      />
      <span
        className={`relative font-extrabold ${s.text} tracking-tight leading-none`}
        style={{
          color: config.textColor,
          textShadow: config.textColor === '#FFFFFF' ? '0 1px 2px rgba(0,0,0,0.2)' : 'none',
        }}
      >
        {config.initials}
      </span>
    </div>
  );
}
