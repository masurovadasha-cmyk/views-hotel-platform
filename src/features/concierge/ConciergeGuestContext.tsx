import {useEffect,useRef,useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {request} from '../local-core/LocalCoreWorkspace';
import {guestContext,type GuestContext} from './support-model';
import {supportText} from './support-locale';
export function ConciergeGuestContext({orderId,csrf,locale,disabled}:{orderId:string;csrf:string;locale:Locale;disabled:boolean}){
 const t=(k:string)=>supportText(locale,k),[value,setValue]=useState<GuestContext|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false);
 const generation=useRef(0);
 useEffect(()=>{setValue(null);setLoading(false);const clear=()=>{generation.current++;setValue(null);setLoading(false);};window.addEventListener('offline',clear);return()=>{generation.current++;window.removeEventListener('offline',clear);};},[orderId,csrf]);
 async function load(){const current=++generation.current;setValue(null);setLoading(true);setError(false);try{const result=guestContext(await request(`service-orders/concierge/${orderId}/profile`,csrf));if(current===generation.current)setValue(result);}catch{if(current===generation.current)setError(true);}finally{if(current===generation.current)setLoading(false);}}
 return <section className="conciergeProfile" data-testid="concierge-guest-context"><button disabled={disabled||loading} onClick={()=>void load()}>{t(value?'refreshContext':'openProfile')}</button>{loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t('unavailable')}</p>}{value&&<><h5>{t('profile')}</h5><p>{t('snapshot')}</p><dl><dt>{t('name')}</dt><dd>{value.guestName}</dd><dt>{t('booking')}</dt><dd>{value.confirmationCode}</dd><dt>{t('unit')}</dt><dd>{value.unitCode||'—'}</dd></dl><p>{t(value.consent?'shared':'notShared')}</p>{value.consent&&<p>{value.preferences}</p>}<button disabled={loading} onClick={()=>setValue(null)}>{t('closeProfile')}</button></>}</section>;
}
