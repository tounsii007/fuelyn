// ============================================================
// TankPilot Web — useTranslations Hook
// Returns a t() function bound to the current locale from the
// Zustand store. Supports nested dot-notation keys.
// ============================================================

'use client';

import { useMemo, useCallback } from 'react';
import { useAppStore } from '@/lib/store/app-store';
import { getTranslations, resolveKey } from '@/lib/i18n';
import type { AppLocale, TranslationKeys } from '@/lib/i18n';

export interface UseTranslationsReturn {
  /** Translate a key. Supports dot-notation: t('common.loading') */
  t: (key: string) => string;
  /** The full translations object for the current locale */
  translations: TranslationKeys;
  /** The current locale code */
  locale: AppLocale;
}

/**
 * Hook that provides translated strings based on the current locale
 * stored in the Zustand app store.
 *
 * @example
 * ```tsx
 * const { t } = useTranslations();
 * return <p>{t('common.loading')}</p>; // "Laden..." or "Loading..."
 * ```
 */
export function useTranslations(): UseTranslationsReturn {
  const locale = useAppStore((s) => s.settings.locale);

  const translations = useMemo(() => getTranslations(locale), [locale]);

  const t = useCallback(
    (key: string): string => resolveKey(translations, key),
    [translations],
  );

  return { t, translations, locale };
}
