// ============================================================
// ThemeProvider — light / dark / system with FOUC-free hydration.
//
// Strategy:
//   • Persist user choice ('light' | 'dark' | 'system') in localStorage
//   • Apply `.dark` class on <html> based on resolved theme
//   • A small inline pre-hydration script (in layout.tsx) sets the class
//     before React mounts so there is NO theme flash
//   • Provider keeps state and exposes setter + resolved theme
// ============================================================

'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'tankpilot:theme';

interface ThemeContextValue {
  /** What the user picked. */
  preference: ThemePreference;
  /** What is actually applied right now. */
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyToDom(resolved: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    if (typeof window === 'undefined') return 'system';
    const stored = window.localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    return stored ?? 'system';
  });

  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(readSystemTheme);

  // Listen for OS-level theme changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolved: ResolvedTheme = preference === 'system' ? systemTheme : preference;

  // Apply class on every change
  useEffect(() => {
    applyToDom(resolved);
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const toggle = useCallback(() => {
    setPreference(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolved, setPreference, toggle }),
    [preference, resolved, setPreference, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>');
  return ctx;
}

/**
 * Inline script that runs before React mounts to apply the persisted or
 * system theme. Render this with `dangerouslySetInnerHTML` in <head> so
 * there is no theme flash on first paint.
 */
export const NO_FLASH_SCRIPT = `
(function() {
  try {
    var key = '${STORAGE_KEY}';
    var pref = localStorage.getItem(key) || 'system';
    var resolved = pref === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : pref;
    var root = document.documentElement;
    if (resolved === 'dark') root.classList.add('dark');
    else root.classList.add('light');
    root.style.colorScheme = resolved;
  } catch (_) {}
})();
`.trim();
