import {createContext, useCallback, useContext, useEffect, useState, type ReactNode} from 'react';
import {translate, type Locale, type MessageValues} from '../../i18n/messages';
import catalog from './guest-translations.json';
export const guestLocaleStorageKey='views.guest.locale';
export function parseGuestLocale(value:unknown):Locale{return value==='ru'||value==='uz'?value:'en';}
export const translateGuest=(locale:Locale,source:string,values?:MessageValues)=>translate(catalog,locale,source,values);
type Context={locale:Locale;setLocale:(locale:Locale)=>void;t:(source:string,values?:MessageValues)=>string};
const GuestLocaleContext=createContext<Context>({locale:'en',setLocale:()=>{},t:(source,values)=>translateGuest('en',source,values)});
export function GuestLocaleProvider({children,manageDocument=true,persist=true}:{children:ReactNode;manageDocument?:boolean;persist?:boolean}){
 const [locale,setLocale]=useState<Locale>(()=>{try{return parseGuestLocale(localStorage.getItem(guestLocaleStorageKey));}catch{return 'en';}});
 useEffect(()=>{if(!manageDocument)return;const previous=document.documentElement.getAttribute('lang');return()=>{if(previous===null)document.documentElement.removeAttribute('lang');else document.documentElement.lang=previous;};},[manageDocument]);
 useEffect(()=>{try{if(persist)localStorage.setItem(guestLocaleStorageKey,locale);}catch{/* The in-memory language selection remains usable. */}if(manageDocument)document.documentElement.lang=locale;},[locale,manageDocument,persist]);
 const t=useCallback((source:string,values?:MessageValues)=>translateGuest(locale,source,values),[locale]);
 return <GuestLocaleContext.Provider value={{locale,setLocale,t}}>{children}</GuestLocaleContext.Provider>;
}
export const useGuestLocale=()=>useContext(GuestLocaleContext);
export function GuestLanguageSelector(){
 const {locale,setLocale,t}=useGuestLocale();
 return <label className="guestLanguage"><span>{t('Interface language')}</span><select aria-label={t('Interface language')} value={locale} onChange={e=>setLocale(parseGuestLocale(e.target.value))}>
  <option value="ru" lang="ru">Русский</option><option value="uz" lang="uz">Oʻzbekcha</option><option value="en" lang="en">English</option>
 </select></label>;
}
