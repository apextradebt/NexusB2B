import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationFR from './locales/fr.json';
import translationEN from './locales/en.json';

const resources = {
  fr: { translation: translationFR },
  en: { translation: translationEN },
};

// The language picked in the sidebar survives a reload.
const LANG_KEY = 'b2b-lang';
const saved = (() => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_KEY) : null;
  } catch {
    return null;
  }
})();

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: saved === 'en' ? 'en' : 'fr',
    fallbackLng: 'fr',
    interpolation: { escapeValue: false },
  });

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(LANG_KEY, lng);
  } catch {
    // private mode: the choice lasts until the reload
  }
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
});

export default i18n;
