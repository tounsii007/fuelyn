export { de } from './locales/de';
export type { TranslationKeys } from './locales/de';
export { en } from './locales/en';
export { enUS } from './locales/en-US';
export { fr } from './locales/fr';

import { de } from './locales/de';
import { en } from './locales/en';
import { enUS } from './locales/en-US';
import { fr } from './locales/fr';
import type { TranslationKeys } from './locales/de';
import type { AppLocale } from '../domain/types';

const translations: Record<AppLocale, TranslationKeys> = {
  de,
  en,
  'en-US': enUS,
  fr,
};

export function getTranslations(locale: AppLocale): TranslationKeys {
  return translations[locale] ?? translations.de;
}
