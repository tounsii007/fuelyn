// ============================================================
// CountUp — RAF-driven number animation with reduced-motion support.
//
// Animates from 0 → `to` over `durationMs`. Honors prefers-reduced-motion
// (jumps straight to the target value). Cleans up on unmount.
// ============================================================

'use client';

import { useEffect, useRef, useState } from 'react';

export interface CountUpProps {
  readonly to: number;
  readonly durationMs?: number;
  readonly format?: (n: number) => string;
  readonly className?: string;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function CountUp({
  to,
  durationMs = 1400,
  format,
  className,
}: CountUpProps) {
  const [value, setValue] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setValue(to);
      return;
    }
    startRef.current = null;
    const tick = (now: number) => {
      if (startRef.current == null) startRef.current = now;
      const elapsed = now - startRef.current;
      const ratio = Math.min(1, elapsed / durationMs);
      setValue(easeOutCubic(ratio) * to);
      if (ratio < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(to);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [to, durationMs]);

  const formatted = format
    ? format(value)
    : Math.round(value).toLocaleString('de-DE');

  return <span className={className}>{formatted}</span>;
}
