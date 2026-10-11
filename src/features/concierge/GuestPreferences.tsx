import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {guestEmailRequest} from '../../api/guest-email';
import {useCleaning} from '../service-orders/useCleaning';
import {preferenceState,type PreferenceState} from './support-model';
import {supportText} from './support-locale';
export function GuestPreferences({reservationId,csrf,locale,online,canRequest,onPending,onExpired}:{reservationId:string;csrf:string;locale:Locale;online:boolean;canRequest:boolean;onPending:(v:boolean)=>void;onExpired:()=>void}){
 const t=(k:string)=>supportText(locale,k),[opened,setOpened]=useState(false),[value,setValue]=useState<PreferenceState|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false),[text,setText]=useState(''),[consent,setConsent]=useState(false),route='services/concierge/preferences';
 async function refresh(){setLoading(true);setValue(null);setError(false);try{const r=preferenceState(await guestEmailRequest(route+'?reservationId='+reservationId),reservationId);setValue(r);setText(r.preferences);setConsent(false);}catch(e){setText('');if(e instanceof Error&&/SESSION_INVALID/.test(e.message))onExpired();else setError(true);}finally{setLoading(false);}}
 const state=useCleaning(a=>guestEmailRequest(a.route,a.body,csrf,a.key),refresh,onPending,onExpired),disabled=state.busy||!!state.pending||loading||!online;
 function save(share:boolean){if(value)void state.act({route,key:crypto.randomUUID(),body:{reservationId,expectedRevision:value.revision,consent:share,preferences:share?text.trim():''}});}
 return <section className="localPanel conciergeWorkspace" data-testid="guest-preferences"><h3>{t('preferences')}</h3>{!opened?<button disabled={!online} onClick={()=>{setOpened(true);void refresh();}}>{t('openPreferences')}</button>:<>
 <p>{t('preferenceHint')}</p>{!online&&<p role="status">{t('offline')}</p>}{loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t('unavailable')}</p>}{state.message&&<p role="status">{t(state.message)}</p>}{state.pending&&<button disabled={state.busy||!online} onClick={()=>void state.act(state.pending!)}>{t('retry')}</button>}
 {value&&<><p>{t(value.consent?'shared':'notShared')}</p><fieldset disabled={disabled}>{canRequest&&<><label>{t('preferences')}<input maxLength={500} value={text} onChange={e=>{setText(e.target.value);setConsent(false);}}/></label><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('share')}</label><button disabled={!consent||!text.trim()} onClick={()=>save(true)}>{t('save')}</button></>}{value.consent&&<button onClick={()=>save(false)}>{t('withdraw')}</button>}</fieldset></>}
 <button disabled={disabled} onClick={()=>void refresh()}>{t('refresh')}</button></>}</section>;
}
