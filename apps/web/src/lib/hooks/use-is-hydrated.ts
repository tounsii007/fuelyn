// ============================================================
// useIsHydrated — canonical mount-gate hook for SSR/CSR safety.
//
// React 19 is strict about hydration mismatches: any divergence
// between server-rendered HTML and the client's first render
// triggers React #418 and (if hooks change) #310. The bugs we
// hit and fixed in this codebase shared one shape: a component
// rendered different content depending on browser-only state
// (`window.matchMedia`, `navigator.onLine`, `localStorage`)
// that the server simply can't see.
//
// This hook returns `false` during SSR AND during the first
// client render, then flips to `true` once a useEffect fires.
// Wrap any browser-state-dependent rendering behind it:
//
//     const hydrated = useIsHydrated();
//     const showDarkIcon = hydrated && resolved === 'dark';
//
// or, when the whole subtree is non-deterministic:
//
//     if (!hydrated) return <Skeleton />;
//
// The button / control stays interactive on first paint (the
// effect fires synchronously after the first commit), so the
// user-perceived delay is one frame at most.
//
// Why a separate hook (vs inlining `useState(false) + useEffect`):
//   - Single canonical pattern → grep-friendly for audits
//   - Ensures everyone uses the same `mounted=false` default
//     (the server-safe value)
//   - Makes the intent self-documenting at the call site
// ============================================================

'use client';

import { useEffect, useState } from 'react';

/**
 * Returns `false` on the server and during the first client
 * render; flips to `true` after the mount effect fires.
 *
 * Use to gate any rendering that depends on browser-only APIs
 * (window/document/navigator/localStorage) so the SSR HTML and
 * the first client render always agree.
 */
export function useIsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  return hydrated;
}
