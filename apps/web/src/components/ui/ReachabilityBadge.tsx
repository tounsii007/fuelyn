// ============================================================
// ReachabilityBadge — Visual indicator for station reachability
// ============================================================

'use client';

import type { ReachabilityStatus } from '@fuelyn/core';

interface ReachabilityBadgeProps {
  status: ReachabilityStatus;
  className?: string;
}

const CONFIG: Record<ReachabilityStatus, { label: string; bg: string; text: string; dot: string }> = {
  safe: {
    label: 'Sicher erreichbar',
    bg: 'bg-reach-safe/10',
    text: 'text-reach-safe',
    dot: 'bg-reach-safe',
  },
  tight: {
    label: 'Knapp erreichbar',
    bg: 'bg-reach-tight/10',
    text: 'text-reach-tight',
    dot: 'bg-reach-tight',
  },
  unreachable: {
    label: 'Nicht erreichbar',
    bg: 'bg-reach-unreachable/10',
    text: 'text-reach-unreachable',
    dot: 'bg-reach-unreachable',
  },
};

export function ReachabilityBadge({ status, className = '' }: ReachabilityBadgeProps) {
  const { label, bg, text, dot } = CONFIG[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${bg} ${text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
