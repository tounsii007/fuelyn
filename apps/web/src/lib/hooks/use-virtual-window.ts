// ============================================================
// useVirtualWindow — minimal virtualisation hook.
//
// Phase B3. A 30-line replacement for react-window for the
// specific case where:
//   • the parent is a single vertical scroller
//   • rows are roughly the same height
//   • the dataset is small enough that re-running the slice on
//     scroll is cheap (= up to a few thousand items)
//
// We deliberately do NOT pull in react-window because:
//   • it ships its own scroll container + sticky-position quirks
//   • overlapping its sticky logic with the existing
//     SmartFilterChips sticky bar produces nasty z-index races
//   • the bundle cost (~3 kB gzip) isn't worth it for the
//     incremental UX win at our list lengths
//
// Returns the slice [startIndex, endIndex) and total height —
// the caller renders the slice with a single absolute-positioned
// spacer above + below to preserve scrollbar geometry.
// ============================================================

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

interface VirtualWindowParams {
  itemCount: number;
  /** Estimated row height in pixels. The actual rows can vary; this
   *  is only used to size the spacer + decide how many rows to render. */
  rowHeight: number;
  /** Extra rows to render above/below the viewport. 3-5 is good. */
  overscan?: number;
}

interface VirtualWindowResult {
  scrollerRef: React.RefObject<HTMLDivElement | null>;
  startIndex: number;
  endIndex: number;
  paddingTop: number;
  paddingBottom: number;
}

export function useVirtualWindow({
  itemCount,
  rowHeight,
  overscan = 4,
}: VirtualWindowParams): VirtualWindowResult {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setViewport(el.clientHeight);
    const onScroll = () => setScrollTop(el.scrollTop);
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => setViewport(el.clientHeight));
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
  }, []);

  return useMemo<VirtualWindowResult>(() => {
    if (itemCount === 0 || viewport === 0) {
      return {
        scrollerRef,
        startIndex: 0,
        endIndex: Math.min(itemCount, 30),
        paddingTop: 0,
        paddingBottom: 0,
      };
    }
    const visible = Math.ceil(viewport / rowHeight);
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(itemCount, start + visible + overscan * 2);
    const paddingTop = start * rowHeight;
    const paddingBottom = (itemCount - end) * rowHeight;
    return { scrollerRef, startIndex: start, endIndex: end, paddingTop, paddingBottom };
  }, [itemCount, rowHeight, overscan, scrollTop, viewport]);
}
