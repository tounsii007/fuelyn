// ============================================================
// LivePriceBadge — small status pill that reflects the live
// price-stream connection. Pulses on every received event so
// users have a visceral confirmation that prices are real-time.
// ============================================================

'use client';

import { useEffect, useState } from 'react';
import { usePriceStream } from '@/lib/hooks/use-price-stream';

export interface LivePriceBadgeProps {
  /** Optionally restrict the stream to specific station IDs (favourites). */
  readonly stationIds?: readonly string[];
  /** Hide the badge entirely (still keeps the connection if `keepAlive`). */
  readonly visible?: boolean;
}

export function LivePriceBadge({ stationIds, visible = true }: LivePriceBadgeProps) {
  const { connected, eventCount, latestEvent } = usePriceStream({ stationIds });
  const [pulse, setPulse] = useState(false);

  // Pulse the dot for 600ms after each event arrives.
  useEffect(() => {
    if (eventCount === 0) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 600);
    return () => clearTimeout(t);
  }, [eventCount]);

  if (!visible) return null;

  const dotColor = connected
    ? pulse
      ? 'bg-emerald-400'
      : 'bg-emerald-500'
    : 'bg-gray-400';

  const text = connected
    ? eventCount === 0
      ? 'Live'
      : latestEvent
        ? `${latestEvent.stationName} → ${latestEvent.newPrice.toFixed(3)} €/L`
        : `Live · ${eventCount} Updates`
    : 'Verbinde...';

  return (
    <div
      role="status"
      aria-live="polite"
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium
                 bg-white/70 dark:bg-gray-800/70 backdrop-blur-sm
                 border border-gray-200 dark:border-gray-700
                 text-gray-700 dark:text-gray-200 shadow-sm"
    >
      <span className="relative inline-flex h-2 w-2">
        <span
          className={`absolute inline-flex h-full w-full rounded-full opacity-75
                      ${pulse ? 'animate-ping' : ''} ${dotColor}`}
        />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
      </span>
      <span className="truncate max-w-[16rem]">{text}</span>
    </div>
  );
}
