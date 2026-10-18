import {useEffect,useRef,useState} from 'react';
import {guestEmailRequest} from '../../api/guest-email';
import {useGuestLocale} from '../guest/GuestLocale';
import {translate} from '../../i18n/messages';
import {formatStaffMoney,localizedName} from '../local-core/staff-locale';
import {cleaningText} from '../service-orders/locale';
import {laundryText} from '../laundry/locale';
import {marketText} from '../market-core/locale';
import {conciergeText} from '../concierge/locale';
import {GuestCleaningDetail,parseCleaningDetail} from '../service-orders/GuestCleaningDetail';
import {GuestLaundryDetail,parseLaundryDetail} from '../laundry/GuestLaundryDetail';
import {GuestMarketDetail,parseMarketDetail} from '../market-core/GuestMarketDetail';
import {GuestConciergeDetail,parseConciergeDetail} from '../concierge/GuestConciergeDetail';
import {orderSources,type OrderSummary} from './guest-order-list';
import {orderTargetRoute,selectOrder,type OrderTarget} from './guest-order-selection';
import catalog from './guest-trips-translations.json';
const stageText={cleaning:cleaningText,laundry:laundryText,market:marketText,concierge:conciergeText};
type Detail={summary:OrderSummary}&(
 {kind:'cleaning';order:ReturnType<typeof parseCleaningDetail>}|
 {kind:'laundry';order:ReturnType<typeof parseLaundryDetail>}|
 {kind:'market';order:ReturnType<typeof parseMarketDetail>}|
 {kind:'concierge';order:ReturnType<typeof parseConciergeDetail>});
function detail(raw:unknown,target:OrderTarget):Detail{
 const {summary,raw:row}=selectOrder(raw,target);
 switch(target.kind){
  case 'cleaning':return {summary,kind:target.kind,order:parseCleaningDetail(row)};
  case 'laundry':return {summary,kind:target.kind,order:parseLaundryDetail(row)};
  case 'market':return {summary,kind:target.kind,order:parseMarketDetail(row)};
  case 'concierge':return {summary,kind:target.kind,order:parseConciergeDetail(row)};
 }
}
export function GuestOrderDetail({reservationId,target,online,blocked,onExpired,onBack,onService}:{reservationId:string;target:OrderTarget;online:boolean;blocked:boolean;onExpired:()=>void;onBack:()=>void;onService:()=>void}){
 const {locale}=useGuestLocale(),t=(s:string)=>translate(catalog,locale,s);
 const [value,setValue]=useState<Detail|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false);
 const generation=useRef(0),busy=useRef(false),connected=useRef(online);connected.current=online;
 const heading=useRef<HTMLHeadingElement>(null);
 async function refresh(){
  if(!connected.current||blocked||busy.current)return;
  const turn=++generation.current;busy.current=true;setLoading(true);setValue(null);setError(false);
  try{
   const raw=await guestEmailRequest(orderTargetRoute(reservationId,target)),next=detail(raw,target);
   if(generation.current===turn&&connected.current)setValue(next);
  }catch(e){if(generation.current===turn&&connected.current){setValue(null);setError(true);if(e instanceof Error&&/^(GUEST_EMAIL|SERVICE)_SESSION_INVALID$/.test(e.message))onExpired();}}
  finally{if(generation.current===turn){busy.current=false;setLoading(false);}}
 }
 useEffect(()=>{void refresh();heading.current?.focus();return()=>{generation.current++;busy.current=false;};},[reservationId,target]);
 useEffect(()=>{if(!online){generation.current++;busy.current=false;setValue(null);setError(false);setLoading(false);}},[online]);
 const summary=value?.summary;
 return <section className="localPanel guestOrderDetail" data-testid="guest-order-detail" aria-busy={loading}>
  <h4 ref={heading} tabIndex={-1}>{t('Order details')} · {t(orderSources[target.kind].title)}</h4>
  <p>{t('View the latest details here. To make changes, open the service.')}</p>
  <button data-testid="guest-order-detail-back" disabled={blocked} onClick={onBack}>{t('Back to orders')}</button>
  {!online&&<p role="status">{t('Offline. Reconnect and refresh this order.')}</p>}
  {loading&&<p role="status">{t('Loading orders…')}</p>}
  {error&&<p role="alert">{t('This order could not be loaded. Refresh or return to the order list.')}</p>}
  <button data-testid="guest-order-detail-refresh" disabled={!online||loading||blocked} onClick={()=>void refresh()}>{t('Refresh order')}</button>
  {online&&value&&summary&&<article data-selected-order={summary.id}>
   <h5>{summary.name?localizedName(summary.name,locale):summary.category?conciergeText(locale,summary.category):t(orderSources[summary.kind].title)}</h5>
   <small>{summary.id}</small><p>{stageText[summary.kind](locale,summary.stage)}</p>
   {summary.money?<p>{t(summary.money.label)}: {formatStaffMoney(summary.money.minor,locale).replace(/UZS$/,summary.money.currency)}</p>:<p>{t('Assistance request — not a paid booking')}</p>}
   {value.kind==='cleaning'?<GuestCleaningDetail order={value.order} locale={locale}/>:value.kind==='laundry'?<GuestLaundryDetail order={value.order} locale={locale}/>:value.kind==='market'?<GuestMarketDetail order={value.order} locale={locale}/>:<GuestConciergeDetail order={value.order} locale={locale}/>}
  </article>}
  <button data-testid="guest-order-detail-service" disabled={blocked} onClick={onService}>{t('Open service')}</button>
 </section>;
}
