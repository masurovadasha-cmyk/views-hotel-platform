import {useEffect,useRef,useState} from 'react';
import {guestEmailRequest} from '../../api/guest-email';
import {useGuestLocale} from '../guest/GuestLocale';
import {translate} from '../../i18n/messages';
import {formatStaffMoney,localizedName} from '../local-core/staff-locale';
import {cleaningText} from '../service-orders/locale';
import {laundryText} from '../laundry/locale';
import {claimText} from '../laundry/claim-locale';
import {marketText} from '../market-core/locale';
import {conciergeText} from '../concierge/locale';
import {GuestCleaningDetail,parseCleaningDetail} from '../service-orders/GuestCleaningDetail';
import {GuestCleaningChange} from '../service-orders/GuestCleaningChange';
import {useCleaning} from '../service-orders/useCleaning';
import {cleaningCancelAttempt,assertCleaningCancelReceipt} from '../service-orders/guest-cleaning-cancel';
import {GuestLaundryDetail,parseLaundryDetail} from '../laundry/GuestLaundryDetail';
import {GuestLaundryCancel} from '../laundry/GuestLaundryCancel';
import {GuestLaundryApprove} from '../laundry/GuestLaundryApprove';
import {assertLaundryAcceptReceipt} from '../laundry/guest-laundry-accept';
import {GuestLaundryReject} from '../laundry/GuestLaundryReject';
import {assertLaundryRejectReceipt} from '../laundry/guest-laundry-reject';
import {GuestLaundryReceive} from '../laundry/GuestLaundryReceive';
import {assertLaundryReceipt} from '../laundry/guest-laundry-receipt';
import {GuestLaundryReport} from '../laundry/GuestLaundryReport';
import {GuestLaundryResolve} from '../laundry/GuestLaundryResolve';
import {assertLaundryResolveReceipt} from '../laundry/guest-laundry-resolve';
import {canReportLaundry,assertLaundryClaimReceipt} from '../laundry/guest-laundry-claim';
import {assertLaundryCancelReceipt} from '../laundry/guest-laundry-cancel';
import {GuestMarketReport} from '../market-core/GuestMarketReport';
import {assertMarketIssueReceipt} from '../market-core/guest-market-issue';
import {GuestMarketReceive} from '../market-core/GuestMarketReceive';
import {assertMarketReceipt} from '../market-core/guest-market-receipt';
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
export function GuestOrderDetail({reservationId,target,online,blocked,csrf,canRequest,onPending,onExpired,onBack,onService}:{reservationId:string;target:OrderTarget;online:boolean;blocked:boolean;csrf:string;canRequest:boolean;onPending:(pending:boolean)=>void;onExpired:()=>void;onBack:()=>void;onService:()=>void}){
 const {locale}=useGuestLocale(),t=(s:string)=>translate(catalog,locale,s);
 const [value,setValue]=useState<Detail|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(false);
 const generation=useRef(0),busy=useRef(false),connected=useRef(online);connected.current=online;
 const heading=useRef<HTMLHeadingElement>(null);
 const command=useCleaning(async attempt=>{
  const receipt=await guestEmailRequest(attempt.route,attempt.body,csrf,attempt.key);
  if(target.kind==='laundry')(attempt.body.action==='resolve_claim'?assertLaundryResolveReceipt:attempt.body.action==='report_claim'?assertLaundryClaimReceipt:attempt.body.action==='confirm_receipt'?assertLaundryReceipt:attempt.body.action==='accept'?assertLaundryAcceptReceipt:attempt.body.action==='reject'?assertLaundryRejectReceipt:assertLaundryCancelReceipt)(receipt,attempt);
  else if(target.kind==='market')(attempt.body.action==='report_issue'?assertMarketIssueReceipt:assertMarketReceipt)(receipt,attempt);
  else assertCleaningCancelReceipt(receipt,attempt);
 },()=>refresh(true),onPending,onExpired);
 const locked=blocked||command.busy||!!command.pending;
 async function refresh(afterCommand=false){
  if(!connected.current||(!afterCommand&&locked)||busy.current)return;
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
  <button data-testid="guest-order-detail-back" disabled={locked} onClick={onBack}>{t('Back to orders')}</button>
  {!online&&<p role="status">{t('Offline. Reconnect and refresh this order.')}</p>}
  {command.message&&<p role="status">{cleaningText(locale,command.message)}</p>}
  {command.pending&&<button disabled={command.busy||!online} onClick={()=>void command.act(command.pending!)}>{cleaningText(locale,'retry')}</button>}
  {loading&&<p role="status">{t('Loading orders…')}</p>}
  {error&&<p role="alert">{t('This order could not be loaded. Refresh or return to the order list.')}</p>}
  <button data-testid="guest-order-detail-refresh" disabled={!online||loading||locked} onClick={()=>void refresh()}>{t('Refresh order')}</button>
  {online&&value&&summary&&<article data-selected-order={summary.id}>
   <h5>{summary.name?localizedName(summary.name,locale):summary.category?conciergeText(locale,summary.category):t(orderSources[summary.kind].title)}</h5>
   <small>{summary.id}</small><p>{stageText[summary.kind](locale,summary.stage)}</p>
   {summary.money?<p>{t(summary.money.label)}: {formatStaffMoney(summary.money.minor,locale).replace(/UZS$/,summary.money.currency)}</p>:<p>{t('Assistance request — not a paid booking')}</p>}
   {value.kind==='cleaning'?<GuestCleaningDetail order={value.order} locale={locale}/>:value.kind==='laundry'?<GuestLaundryDetail order={value.order} locale={locale}/>:value.kind==='market'?<GuestMarketDetail order={value.order} locale={locale}/>:<GuestConciergeDetail order={value.order} locale={locale}/>}
   {value.kind==='market'&&summary.money&&<div data-testid="guest-order-detail-market-receipt"><GuestMarketReceive key={value.order.revision} order={{orderId:summary.id,stage:summary.stage,revision:value.order.revision,totalMinor:summary.money.minor,currency:summary.money.currency,issue:value.order.issue?{...value.order.issue,answer:value.order.issue.answer??undefined}:null}} locale={locale} disabled={locked||loading||!online} act={async attempt=>{
    if(locked||loading||!connected.current)return;
    generation.current++;setValue(null);setError(false);await command.act(attempt);
   }}/></div>}
   {value.kind==='market'&&summary.money&&<div data-testid="guest-order-detail-market-issue"><GuestMarketReport key={value.order.revision} order={{orderId:summary.id,stage:summary.stage,revision:value.order.revision,totalMinor:summary.money.minor,currency:summary.money.currency,issue:value.order.issue?{...value.order.issue,answer:value.order.issue.answer??undefined}:null}} locale={locale} disabled={locked||loading||!online} act={async attempt=>{
    if(locked||loading||!connected.current)return;
    generation.current++;setValue(null);setError(false);await command.act(attempt);
   }}/></div>}
   {value.kind==='laundry'&&summary.stage==='awaiting_return'&&<p role="status">{laundryText(locale,'returnPending')}</p>}
   {value.kind==='laundry'&&value.order.claim&&value.order.claim.status!=='resolved'&&<p role="status">{claimText(locale,summary.stage==='closed'?'alreadyCharged':'blocked')}</p>}
   {value.kind==='laundry'&&(value.order.claim?.history.length??0)>=8&&<p role="status">{claimText(locale,value.order.claim?.status==='resolved'?'limitResolved':'limit')}</p>}
   {value.kind==='cleaning'&&canRequest&&<div data-testid="guest-order-detail-cleaning-change"><GuestCleaningChange cancelOnly key={value.order.revision} order={{orderId:summary.id,stage:summary.stage,revision:value.order.revision}} locale={locale} disabled={locked||loading||!online} act={async a=>{
    if(locked||loading||!connected.current)return;
    const attempt=cleaningCancelAttempt(summary.id,value.order.revision,a.key);
    generation.current++;setValue(null);setError(false);await command.act(attempt);
   }}/></div>}
   {value.kind==='laundry'&&canRequest&&summary.stage==='requested'&&<div data-testid="guest-order-detail-laundry-change"><GuestLaundryCancel key={value.order.revision} order={{intakeId:summary.id,stage:summary.stage,revision:value.order.revision}} locale={locale} disabled={locked||loading||!online} act={async attempt=>{
    if(locked||loading||!connected.current)return;
    generation.current++;setValue(null);setError(false);await command.act(attempt);
   }}/></div>}
   {value.kind==='laundry'&&canRequest&&summary.stage==='quoted'&&value.order.items&&value.order.returnBy&&summary.money&&<div data-testid="guest-order-detail-laundry-approve"><GuestLaundryApprove key={value.order.revision} order={{intakeId:summary.id,stage:summary.stage,revision:value.order.revision,totalMinor:summary.money.minor}} locale={locale} disabled={locked||loading||!online} act={async attempt=>{
    if(locked||loading||!connected.current)return;
    generation.current++;setValue(null);setError(false);await command.act(attempt);
   }}/></div>}
   {value.kind==='laundry'&&summary.stage==='quoted'&&value.order.items&&value.order.returnBy&&<div data-testid="guest-order-detail-laundry-reject"><GuestLaundryReject key={value.order.revision} order={{intakeId:summary.id,stage:summary.stage,revision:value.order.revision}} locale={locale} disabled={locked||loading||!online} act={async attempt=>{
    if(locked||loading||!connected.current)return;
    generation.current++;setValue(null);setError(false);await command.act(attempt);
   }}/></div>}
   {value.kind==='laundry'&&summary.stage==='delivered'&&value.order.items&&value.order.returnBy&&summary.money&&(!value.order.claim||value.order.claim.status==='resolved')&&<div data-testid="guest-order-detail-laundry-receipt"><GuestLaundryReceive key={value.order.revision} order={{intakeId:summary.id,stage:summary.stage,revision:value.order.revision,totalMinor:summary.money.minor,currency:summary.money.currency,claim:value.order.claim}} locale={locale} disabled={locked||loading||!online} act={async attempt=>{
    if(locked||loading||!connected.current)return;
    generation.current++;setValue(null);setError(false);await command.act(attempt);
   }}/></div>}
   {value.kind==='laundry'&&canReportLaundry(summary.stage,value.order.claim)&&value.order.items&&value.order.returnBy&&summary.money&&<div data-testid="guest-order-detail-laundry-claim"><GuestLaundryReport key={value.order.revision} order={{intakeId:summary.id,stage:summary.stage,revision:value.order.revision,totalMinor:summary.money.minor,currency:summary.money.currency,items:value.order.items,claim:value.order.claim}} locale={locale} disabled={locked||loading||!online} act={async attempt=>{
    if(locked||loading||!connected.current)return;
    generation.current++;setValue(null);setError(false);await command.act(attempt);
   }}/></div>}
   {value.kind==='laundry'&&value.order.claim&&value.order.claim.status!=='resolved'&&summary.money&&<div data-testid="guest-order-detail-laundry-resolve"><GuestLaundryResolve key={value.order.revision} order={{intakeId:summary.id,stage:summary.stage,revision:value.order.revision,totalMinor:summary.money.minor,currency:summary.money.currency,claim:value.order.claim}} locale={locale} disabled={locked||loading||!online} act={async attempt=>{
    if(locked||loading||!connected.current)return;
    generation.current++;setValue(null);setError(false);await command.act(attempt);
   }}/></div>}
  </article>}
  <button data-testid="guest-order-detail-service" disabled={locked} onClick={onService}>{t('Open service')}</button>
 </section>;
}
