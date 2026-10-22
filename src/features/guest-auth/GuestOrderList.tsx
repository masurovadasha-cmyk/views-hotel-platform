import {useEffect,useRef,useState} from 'react';
import {guestEmailRequest} from '../../api/guest-email';
import {useGuestLocale} from '../guest/GuestLocale';
import {translate} from '../../i18n/messages';
import {formatStaffMoney,localizedName} from '../local-core/staff-locale';
import {cleaningText} from '../service-orders/locale';
import {laundryText} from '../laundry/locale';
import {marketText} from '../market-core/locale';
import {conciergeText} from '../concierge/locale';
import {orderKinds,orderSources,orderPage,mergeOrderPages,type OrderKind,type OrderGroup,type OrderPage} from './guest-order-list';
import catalog from './guest-trips-translations.json';
import type {OrderTarget} from './guest-order-selection';
type Pages=Partial<Record<OrderKind,OrderPage>>;
const stageText={cleaning:cleaningText,laundry:laundryText,market:marketText,concierge:conciergeText};
export function GuestOrderList({reservationId,online,blocked,onExpired,onOpen}:{reservationId:string;online:boolean;blocked:boolean;onExpired:()=>void;onOpen:(target:OrderTarget)=>void}){
 const {locale}=useGuestLocale(),t=(s:string)=>translate(catalog,locale,s);
 const [pages,setPages]=useState<Pages|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false);
 const [kind,setKind]=useState<OrderKind|'all'>('all'),[group,setGroup]=useState<OrderGroup|'all'>('all');
 const generation=useRef(0),busy=useRef(false),connected=useRef(online);connected.current=online;
 useEffect(()=>()=>{generation.current++;},[]);
 useEffect(()=>{if(!online){generation.current++;busy.current=false;setPages(null);setLoading(false);setError(false);}},[online]);
 async function load(more?:OrderKind){
  if(!online||blocked||busy.current||more&&!pages?.[more]?.nextCursor)return;
  const previous=pages,turn=++generation.current;busy.current=true;setLoading(true);setError(false);setPages(null);
  try{
   const entries=await Promise.all((more?[more]:orderKinds).map(async k=>{
    const cursor=more?previous?.[k]?.nextCursor:null;
    const raw=await guestEmailRequest(orderSources[k].route+'?reservationId='+encodeURIComponent(reservationId)+(cursor?'&cursor='+encodeURIComponent(cursor):''));
    return [k,orderPage(k,raw,cursor??null)] as const;
   }));
   if(generation.current!==turn||!connected.current)return;
   const next=Object.fromEntries(entries) as Pages;
   setPages(more?{...previous,[more]:mergeOrderPages(previous![more]!,next[more]!)}:next);
  }catch(e){if(generation.current===turn&&connected.current){setPages(null);setError(true);if(e instanceof Error&&/^(GUEST_EMAIL|SERVICE)_SESSION_INVALID$/.test(e.message))onExpired();}}
  finally{if(generation.current===turn){busy.current=false;setLoading(false);}}
 }
 const disabled=loading||!online||blocked,rows=orderKinds.flatMap(k=>pages?.[k]?.items??[]).filter(r=>(kind==='all'||r.kind===kind)&&(group==='all'||r.group===group));
 return <section className="guestOrderList" data-testid="guest-order-list" aria-label={t('Order list')} aria-busy={loading}>
  <h4>{t('Order list')}</h4><p>{t('Grouped by service. Filters apply to loaded orders; load more for the remaining orders.')}</p>
  <p>{t('Amounts do not show payment or refund status. Open the service for price details.')}</p>
  {!online&&<p role="status">{t('Offline. Reconnect and load orders again.')}</p>}{loading&&<p role="status">{t('Loading orders…')}</p>}
  {error&&<p role="alert">{t('Could not load all orders. Retry manually.')}</p>}
  <button data-testid="guest-orders-load" disabled={disabled} onClick={()=>void load()}>{t(pages?'Refresh orders':'Load orders')}</button>
  {pages&&<><div className="guestOrderFilters">
   <label>{t('Service filter')}<select data-testid="guest-orders-kind" value={kind} onChange={e=>setKind(e.target.value as OrderKind|'all')}><option value="all">{t('All services')}</option>{orderKinds.map(k=><option key={k} value={k}>{t(orderSources[k].title)}</option>)}</select></label>
   <label>{t('Order status')}<select data-testid="guest-orders-state" value={group} onChange={e=>setGroup(e.target.value as OrderGroup|'all')}>{(['all','active','completed','cancelled'] as const).map(g=><option key={g} value={g}>{t({all:'All statuses',active:'Active orders',completed:'Completed orders',cancelled:'Cancelled orders'}[g])}</option>)}</select></label>
  </div>{!rows.length&&<p>{t('No matching orders on loaded pages.')}</p>}
  {rows.map(r=><article key={r.kind+':'+r.id} data-order-summary={r.id} data-order-kind={r.kind}>
   <h4>{t(orderSources[r.kind].title)}{r.name?' · '+localizedName(r.name,locale):r.category?' · '+conciergeText(locale,r.category):''}</h4>
   <small>{r.id}</small><p>{stageText[r.kind](locale,r.stage)}</p>
   {r.money?<p>{t(r.money.label)}: {formatStaffMoney(r.money.minor,locale).replace(/UZS$/,r.money.currency)}</p>:<p>{t('Assistance request — not a paid booking')}</p>}
   <button disabled={disabled} onClick={()=>onOpen({kind:r.kind,id:r.id,cursor:r.cursor})}>{t('Open order')}</button>
  </article>)}
  {orderKinds.filter(k=>pages[k]?.nextCursor).map(k=><button key={k} data-testid={'guest-orders-more-'+k} disabled={disabled} onClick={()=>void load(k)}>{t('Load more')} · {t(orderSources[k].title)}</button>)}
  </>}
 </section>;
}
