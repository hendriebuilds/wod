import { createContext, useContext, useState } from 'react';
import nl from './i18n/nl.js';
import en from './i18n/en.js';

const LANGS = { nl, en };

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('wod_lang') || 'nl');

  const toggle = () => {
    const next = lang === 'nl' ? 'en' : 'nl';
    localStorage.setItem('wod_lang', next);
    setLang(next);
  };

  const strings = LANGS[lang];

  const t = (key, vars) => {
    const val = strings[key];
    if (val === undefined) return key;
    if (typeof val !== 'string') return val;
    if (!vars) return val;
    return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), val);
  };

  return (
    <LanguageContext.Provider value={{ lang, toggle, t, strings }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
