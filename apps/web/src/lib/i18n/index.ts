// ============================================================
// Fuelyn Web — i18n Setup
// Provides locale detection and translation access.
// ============================================================

import type { AppLocale, TranslationKeys } from '@fuelyn/core';
import { de, en, enUS, fr } from '@fuelyn/core';

const translations: Record<AppLocale, TranslationKeys> = {
  de,
  en,
  'en-US': enUS,
  fr,
};

/**
 * Get the full translation object for a given locale.
 */
export function getTranslations(locale: AppLocale): TranslationKeys {
  return translations[locale] ?? translations.de;
}

/**
 * Resolve a dot-separated key path into a translation string.
 * Example: resolve(translations.de, 'common.loading') => 'Laden...'
 */
export function resolveKey(obj: TranslationKeys, key: string): string {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return key;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : key;
}

/**
 * Detect the preferred locale from browser settings.
 * Order of precedence: en-US (American English) > fr (any French
 * variant) > en (any other English variant) > de (default).
 */
export function detectLocale(): AppLocale {
  if (typeof navigator === 'undefined') return 'de';

  const langs = (navigator.languages?.length ? navigator.languages : [navigator.language ?? ''])
    .map((l) => l.toLowerCase());

  for (const lang of langs) {
    if (lang === 'en-us' || lang.startsWith('en-us')) return 'en-US';
    if (lang === 'fr' || lang.startsWith('fr-') || lang.startsWith('fr_')) return 'fr';
    if (lang.startsWith('en')) return 'en';
    if (lang.startsWith('de')) return 'de';
  }
  return 'de';
}

export type { AppLocale, TranslationKeys };
