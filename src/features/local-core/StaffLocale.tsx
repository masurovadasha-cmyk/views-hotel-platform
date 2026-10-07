import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react';
import {parseStaffLocale, staffLocaleStorageKey, translateStaff, type MessageValues, type StaffLocale} from './staff-locale';

type LocaleContext = {locale: StaffLocale; setLocale: (locale: StaffLocale) => void; t: (source: string, values?: MessageValues) => string};
const StaffLocaleContext = createContext<LocaleContext>({locale: 'ru', setLocale: () => {}, t: (source, values) => translateStaff('ru', source, values)});
export function StaffLocaleProvider({children}: {children: ReactNode}) {
  const [locale, setLocale] = useState<StaffLocale>(() => {
    try { return parseStaffLocale(localStorage.getItem(staffLocaleStorageKey)); } catch { return 'ru'; }
  });
  useEffect(() => {
    const previous = document.documentElement.getAttribute('lang');
    return () => { if (previous === null) document.documentElement.removeAttribute('lang'); else document.documentElement.lang = previous; };
  }, []);
  useEffect(() => {
    try { localStorage.setItem(staffLocaleStorageKey, locale); } catch { /* In-memory choice still works. */ }
    document.documentElement.lang = locale;
  }, [locale]);
  const t = useCallback((source: string, values?: MessageValues) => translateStaff(locale, source, values), [locale]);
  return <StaffLocaleContext.Provider value={{locale, setLocale, t}}>{children}</StaffLocaleContext.Provider>;
}
export const useStaffLocale = () => useContext(StaffLocaleContext);

export function StaffLanguageSelector() {
  const {locale, setLocale, t} = useStaffLocale();
  return <label className="staffLanguage"><span>{t('Язык интерфейса')}</span>
    <select aria-label={t('Язык интерфейса')} value={locale} onChange={event => setLocale(parseStaffLocale(event.target.value))}>
      <option value="ru" lang="ru">Русский</option><option value="uz" lang="uz">Oʻzbekcha</option><option value="en" lang="en">English</option>
    </select>
  </label>;
}
