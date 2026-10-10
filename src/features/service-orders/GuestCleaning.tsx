import {useEffect,useState} from 'react';
import {guestEmailRequest} from '../../api/guest-email';
import {useGuestLocale} from '../guest/GuestLocale';
import {formatStaffMoney,localizedName} from '../local-core/staff-locale';
import {cleaningText} from './locale';
import {useCleaning} from './useCleaning';
import {GuestServiceFeedback} from './GuestServiceFeedback';
import {GuestCleaningChange} from './GuestCleaningChange';
import type {CleaningItem,CleaningOrder,Page} from './model';
export function GuestCleaning({reservationId,csrf,online,onExpired,onPending,canRequest=true}:{canRequest?:boolean;reservationId:string;csrf:string;online:boolean;onExpired:()=>void;onPending:(v:boolean)=>void}){
 const {locale}=useGuestLocale(),t=(k:string)=>cleaningText(locale,k);
 const [catalog,setCatalog]=useState<Page<CleaningItem>>({items:[],nextCursor:null}),[orders,setOrders]=useState<Page<CleaningOrder>>({items:[],nextCursor:null});
 const [service,setService]=useState(''),[time,setTime]=useState(''),[consent,setConsent]=useState(false),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const query='?reservationId='+encodeURIComponent(reservationId);
 async function load(kind:'catalog'|'orders',cursor?:string){const page=await guestEmailRequest('services/'+kind+query+(cursor?'&cursor='+cursor:'')) as unknown as Page<CleaningItem>&Page<CleaningOrder>;if(kind==='catalog'){setCatalog(page);setService('');setConsent(false);}else setOrders(page);}
 async function refresh(){setLoading(true);setError('');try{await Promise.all([...(canRequest?[load('catalog')]:[]),load('orders')]);}catch(e){setCatalog({items:[],nextCursor:null});setOrders({items:[],nextCursor:null});if(e instanceof Error&&/SESSION_INVALID/.test(e.message))onExpired();else setError('unavailable');}finally{setLoading(false);}}
 const state=useCleaning(a=>guestEmailRequest(a.route,a.body,csrf,a.key),refresh,onPending,onExpired);
 useEffect(()=>{void refresh();},[reservationId,canRequest]);
 async function repeat(orderId:string){
  setLoading(true);setError('');setService('');setConsent(false);setTime('');
  try{const current=await guestEmailRequest(`services/orders/${orderId}/repeat`) as unknown as Page<CleaningItem>;setCatalog(current);setService(current.items[0]?.id||'');}
  catch(e){setCatalog({items:[],nextCursor:null});if(e instanceof Error&&/SESSION_INVALID/.test(e.message))onExpired();else setError('repeatUnavailable');}
  finally{setLoading(false);}
 }
 const chosen=catalog.items.find(s=>s.id===service),disabled=state.busy||!!state.pending||!online||loading;
 const money=(minor:string,currency:string)=>formatStaffMoney(minor,locale).replace(/UZS$/,currency);
 return <section className="localPanel" data-testid="guest-cleaning"><h3>{t('title')}</h3><p>{t('pilot')}</p>
 {!online&&<p role="status">{t('offline')}</p>}{error&&<p role="alert">{t(error)}</p>}{state.message&&<p role="status">{t(state.message)}</p>}
 {state.pending&&<button disabled={state.busy||!online} onClick={()=>void state.act(state.pending!)}>{t('retry')}</button>}
 {!canRequest&&<p>{t('historyOnly')}</p>}
 {canRequest&&<form onSubmit={e=>{e.preventDefault();if(!chosen||!consent||!Number.isFinite(Date.parse(time)))return;void state.act({route:'services/orders',key:crypto.randomUUID(),body:{reservationId,serviceId:chosen.id,expectedRevision:chosen.revision,expectedPriceMinor:chosen.priceMinor,requestedFor:new Date(time).toISOString()}});}}>
 <fieldset disabled={disabled}><label>{t('service')}<select aria-label={t('service')} required value={service} onChange={e=>{setService(e.target.value);setConsent(false);}}><option value="">—</option>{catalog.items.map(s=><option value={s.id} key={s.id}>{localizedName(s.name,locale)} · {money(s.priceMinor,s.currency)}</option>)}</select></label>
 <label>{t('time')}<input type="datetime-local" required value={time} onChange={e=>setTime(e.target.value)}/></label><p>{t('terms')}</p>
 <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('consent')}</label><button disabled={!chosen||!consent}>{t('request')}</button></fieldset></form>}
 {canRequest&&catalog.nextCursor&&<button disabled={disabled} onClick={()=>void load('catalog',catalog.nextCursor!).catch(()=>setError('unavailable'))}>{t('service')} · {t('next')}</button>}
 {!orders.items.length&&<p>{t('empty')}</p>}{orders.items.map(o=><article key={o.orderId} data-order-id={o.orderId}><h4>{localizedName(o.name,locale)}</h4><p>{t(o.stage)} · {money(o.totalMinor,o.currency)}</p><time>{new Date(o.requestedFor).toLocaleString(locale)}</time>{canRequest&&<GuestCleaningChange key={o.revision} order={o} locale={locale} disabled={disabled} act={state.act}/>}
 <GuestServiceFeedback order={o} locale={locale} disabled={disabled} act={state.act}/>
 {canRequest&&['done','cancelled'].includes(o.stage)&&<button disabled={disabled} onClick={()=>void repeat(o.orderId)}>{t('repeatOrder')}</button>}</article>)}
 {orders.nextCursor&&<button disabled={disabled} onClick={()=>void load('orders',orders.nextCursor!).catch(()=>setError('unavailable'))}>{t('next')}</button>}
 <button disabled={disabled} onClick={()=>void refresh()}>{t('refresh')}</button></section>;
}
