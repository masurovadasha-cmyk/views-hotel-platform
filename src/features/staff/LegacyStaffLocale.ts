import {useCallback} from 'react';
import {useStaffLocale} from '../local-core/StaffLocale';
import {translate,type MessageValues} from '../../i18n/messages';
import catalog from './legacy-staff-translations.json';
export function useLegacyStaffLocale(){
 const {locale}=useStaffLocale();
 const t=useCallback((source:string,values?:MessageValues)=>translate(catalog,locale,source,values),[locale]);
 return {locale,t};
}

export function legacyDate(value:string,locale:'ru'|'uz'|'en',dateOnly=false){
 const iso=/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T00:00:00Z':/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)?value.replace(' ','T')+'Z':value;
 const date=new Date(iso);if(!Number.isFinite(date.getTime()))return value||'—';
 return new Intl.DateTimeFormat({ru:'ru-RU',uz:'uz-Latn-UZ',en:'en-GB'}[locale],{timeZone:'Asia/Tashkent',year:'numeric',month:'short',day:'numeric',...(dateOnly?{}:{hour:'2-digit',minute:'2-digit'} as const)}).format(date);
}
