// ============================================================
// useInView — minimal IntersectionObserver hook.
//
// Used to lazy-fetch per-station price history only when the
// corresponding StationCard scrolls into the viewport. Without
// this, a 14-card list fires 14 simultaneous network requests
// on initial render, which spikes the LCP unnecessarily.
//
// `once: true` (default) disconnects the observer after the first
// intersection, so the boolean stays `true` even after the user
// scrolls away — this avoids re-fetching when the card scrolls
// back into view.
// ============================================================

'use client';

import { useEffect, useState, type RefObject } from 'react';

interface UseInViewOptions {
  /** CSS-style margin around the root for the observer (e.g. "100px"). */
  rootMargin?: string;
  /** Lock the result to true after first intersection. Default: true. */
  once?: boolean;
}

export function useInView<T extends Element>(
  ref: RefObject<T | null>,
  { rootMargin = '120px', once = true }: UseInViewOptions = {},
): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      // SSR / very old browser fallback: assume visible so the request
      // still fires. Better than a permanently empty sparkline.
      setInView(true);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold: 0 },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [ref, rootMargin, once]);

  return inView;
}
