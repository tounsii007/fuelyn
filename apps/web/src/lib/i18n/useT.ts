// ============================================================
// useT — minimal i18n helper.
//
// Phase C4. We deliberately don't pull in next-intl / i18next /
// react-intl yet because:
//   • The MVP needs only string lookup + a tiny ICU-style
//     placeholder format ({name} → "Aral 24h").
//   • The app is currently single-locale (de-DE). The hook
//     gives us the seam to add more without rewriting callers.
//   • Each library is 8-15 kB gzipped — premature for the value.
//
// When the locale count grows past 3 or we need plural rules /
// date formatting beyond Intl, swap this out for next-intl. The
// `t(key, vars)` signature is intentionally compatible.
// ============================================================

'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import deMessages from './messages/de.json';
import enMessages from './messages/en.json';

type Messages = Record<string, unknown>;

const BUNDLES: Record<string, Messages> = {
  'de-DE': deMessages as Messages,
  'en-GB': enMessages as Messages,
};

const LOCALE_STORAGE_KEY = 'fy:locale';
const FALLBACK_LOCALE = 'de-DE';

// ─── Locale store ──────────────────────────────────────────
// Tiny external-store so the hook re-renders all consumers when
// the locale flips. No Context, no Provider needed.
let currentLocale: string = FALLBACK_LOCALE;
const listeners = new Set<() => void>();

function detectInitialLocale(): string {
  if (typeof window === 'undefined') return FALLBACK_LOCALE;
  try {
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && BUNDLES[stored]) return stored;
  } catch {
    // localStorage may be blocked.
  }
  // Match navigator.language against our bundles. The simple
  // prefix check is enough for de-* / en-* — full BCP 47
  // negotiation can come later.
  const nav = (typeof navigator !== 'undefined' ? navigator.language : '') || FALLBACK_LOCALE;
  const navPrefix = (nav.split('-')[0] ?? nav).toLowerCase();
  const matched = Object.keys(BUNDLES).find((k) => {
    if (k.toLowerCase() === nav.toLowerCase()) return true;
    const kPrefix = (k.split('-')[0] ?? k).toLowerCase();
    return kPrefix === navPrefix;
  });
  return matched ?? FALLBACK_LOCALE;
}

if (typeof window !== 'undefined') {
  currentLocale = detectInitialLocale();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string {
  return currentLocale;
}

function getServerSnapshot(): string {
  return FALLBACK_LOCALE;
}

export function setLocale(locale: string): void {
  if (!BUNDLES[locale]) {
    console.warn(`[i18n] Unknown locale: ${locale} — falling back to ${FALLBACK_LOCALE}`);
    locale = FALLBACK_LOCALE;
  }
  currentLocale = locale;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // best-effort
  }
  listeners.forEach((l) => l());
}

export function getAvailableLocales(): ReadonlyArray<{ code: string; name: string }> {
  return Object.entries(BUNDLES).map(([code, msgs]) => {
    const meta = (msgs as { $meta?: { name?: string } }).$meta;
    return { code, name: meta?.name ?? code };
  });
}

// ─── The hook ──────────────────────────────────────────────
type Vars = Record<string, string | number>;

export function useT() {
  const locale = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // The compile-time invariant is that FALLBACK_LOCALE is always
  // present in BUNDLES (we ship it with the app), so the fallback
  // chain can never produce undefined. TS still narrows index-access
  // returns to T | undefined under noUncheckedIndexedAccess; assert
  // explicitly to keep the helper APIs typed cleanly.
  const bundle: Messages = BUNDLES[locale] ?? BUNDLES[FALLBACK_LOCALE]!;

  const t = useCallback(
    (key: string, vars?: Vars): string => {
      const raw = lookup(bundle, key);
      if (raw == null) {
        // In dev, surface the missing key so it's obvious in the UI.
        return process.env.NODE_ENV === 'development' ? `‹${key}›` : key;
      }
      if (!vars) return String(raw);
      return formatVars(String(raw), vars);
    },
    [bundle],
  );

  return useMemo(() => ({ t, locale }), [t, locale]);
}

// ─── Internals ─────────────────────────────────────────────
function lookup(bundle: Messages, key: string): unknown {
  // Dot-path lookup: "filter.diesel" → bundle.filter.diesel
  const parts = key.split('.');
  let cur: unknown = bundle;
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function formatVars(template: string, vars: Vars): string {
  // Replace {name} placeholders. Unknown vars stay verbatim so a
  // typo is obvious in the UI ("save {amount} EUR" with a missing
  // amount renders as-is rather than silently becoming "save  EUR").
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    const value = vars[name];
    return value !== undefined ? String(value) : m;
  });
}
