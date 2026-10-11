import {useState} from 'react';
import {guestEmailRequest} from '../../api/guest-email';
import {useGuestLocale} from '../guest/GuestLocale';
import {localizedName} from '../local-core/staff-locale';
import {useCleaning} from '../service-orders/useCleaning';
import type {CleaningItem,Page} from '../service-orders/model';
import {laundryText} from './locale';
import type {LaundryIntake} from './model';
import {LaundrySummary,laundryMoney} from './LaundrySummary';
import {GuestLaundryActions} from './GuestLaundryActions';
export function GuestLaundry({reservationId,csrf,online,onExpired,onPending,canRequest}:{reservationId:string;csrf:string;online:boolean;onExpired:()=>void;onPending:(v:boolean)=>void;canRequest:boolean}){
 const {locale}=useGuestLocale(),t=(k:string)=>laundryText(locale,k);
 const [opened,setOpened]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [catalog,setCatalog]=useState<Page<CleaningItem>>({items:[],nextCursor:null}),[orders,setOrders]=useState<Page<LaundryIntake>>({items:[],nextCursor:null});
 const [service,setService]=useState(''),[count,setCount]=useState(1),[pickup,setPickup]=useState(''),[preferences,setPreferences]=useState('');
 const query='?reservationId='+encodeURIComponent(reservationId);
 async function load(kind:'catalog'|'orders',cursor?:string){
  const response=await guestEmailRequest('services/laundry'+(kind==='catalog'?'/catalog':'')+query+(cursor?'&cursor='+cursor:''));
  if(kind==='catalog'){setCatalog(response as unknown as Page<CleaningItem>);setService('');}else setOrders(response as unknown as Page<LaundryIntake>);
 }
 async function refresh(kind?:'catalog'|'orders',cursor?:string){setLoading(true);setError('');try{if(kind)await load(kind,cursor);else await Promise.all([load('orders'),...(canRequest?[load('catalog')]:[])]);}catch(e){setCatalog({items:[],nextCursor:null});setOrders({items:[],nextCursor:null});if(e instanceof Error&&/SESSION_INVALID/.test(e.message))onExpired();else setError('unavailable');}finally{setLoading(false);}}
 const state=useCleaning(a=>guestEmailRequest(a.route,a.body,csrf,a.key),()=>refresh(),onPending,onExpired);
 const chosen=catalog.items.find(i=>i.id===service),disabled=state.busy||!!state.pending||loading||!online;
 return <section className="localPanel" data-testid="guest-laundry"><h3>{t('title')}</h3>
 {!opened?<button disabled={!online} onClick={()=>{setOpened(true);void refresh();}}>{t('open')}</button>:<>
 <p>{t('pilot')}</p>{!online&&<p role="status">{t('offline')}</p>}{loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t(error)}</p>}{state.message&&<p role="status">{t(state.message)}</p>}
 {state.pending&&<button disabled={state.busy||!online} onClick={()=>void state.act(state.pending!)}>{t('retry')}</button>}
 {canRequest&&<form onSubmit={e=>{e.preventDefault();if(!chosen||!Number.isFinite(Date.parse(pickup)))return;void state.act({route:'services/laundry',key:crypto.randomUUID(),body:{reservationId,serviceId:chosen.id,expectedRevision:chosen.revision,declaredCount:count,preferences,pickupAt:new Date(pickup).toISOString()}});}}><fieldset disabled={disabled}>
 <label>{t('service')}<select aria-label={t('service')} required value={service} onChange={e=>setService(e.target.value)}><option value="">—</option>{catalog.items.map(i=><option key={i.id} value={i.id}>{localizedName(i.name,locale)} · {t('perItem')}: {laundryMoney(i.priceMinor,i.currency,locale)}</option>)}</select></label>
 <label>{t('count')}<input type="number" min={1} max={50} step={1} required value={count} onChange={e=>setCount(e.target.valueAsNumber)}/></label>
 <label>{t('pickup')}<input type="datetime-local" required value={pickup} onChange={e=>setPickup(e.target.value)}/></label>
 <label>{t('preferences')}<input maxLength={500} value={preferences} onChange={e=>setPreferences(e.target.value)}/></label>
 {chosen&&Number.isInteger(count)&&count>0&&count<=50&&<p>{t('estimate')}: {laundryMoney((BigInt(chosen.priceMinor)*BigInt(count)).toString(),chosen.currency,locale)}</p>}
 <p>{t('terms')}</p><button disabled={!chosen}>{t('request')}</button></fieldset></form>}
 {canRequest&&catalog.nextCursor&&<button disabled={disabled} onClick={()=>void refresh('catalog',catalog.nextCursor!)}>{t('service')} · {t('next')}</button>}
 {!loading&&!error&&!orders.items.length&&<p>{t('empty')}</p>}
 {orders.items.map(o=><article className="localPanel" key={o.intakeId+':'+o.revision} data-intake-id={o.intakeId}><LaundrySummary intake={o} locale={locale}/><GuestLaundryActions intake={o} locale={locale} canRequest={canRequest} disabled={disabled} act={state.act}/></article>)}
 <button disabled={disabled} onClick={()=>void refresh()}>{t('refresh')}</button>{orders.nextCursor&&<button disabled={disabled} onClick={()=>void refresh('orders',orders.nextCursor!)}>{t('next')}</button>}</>}</section>;
}
