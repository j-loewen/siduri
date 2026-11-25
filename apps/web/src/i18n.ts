import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';

/**
 * UI translations. English (locales/en.json) is the reference; to add a language, copy it to
 * locales/<code>.json, translate the values and list it in RESOURCES and LANGUAGE_NAMES.
 */
export const RESOURCES = { en: { translation: en } } as const;
export const LANGUAGE_NAMES: Record<keyof typeof RESOURCES, string> = { en: 'English' };

const supported = Object.keys(RESOURCES);

/** "auto" → the browser's language if we have it, else English. */
export function resolveLanguage(pref: string | undefined): string {
  if (pref && pref !== 'auto' && supported.includes(pref)) return pref;
  const browser = navigator.languages.map((l) => l.split('-')[0]!).find((l) => supported.includes(l));
  return browser ?? 'en';
}

void i18n.use(initReactI18next).init({
  resources: RESOURCES,
  lng: resolveLanguage('auto'),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
