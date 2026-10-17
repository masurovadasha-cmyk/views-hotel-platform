import {useEffect,useState} from 'react';
import {request} from '../local-core/LocalCoreWorkspace';
import {useStaffLocale} from '../local-core/StaffLocale';
import {majorToMinor} from '../local-core/folio-workspace-api';
import {useCleaning} from '../service-orders/useCleaning';
import type {Page} from '../service-orders/model';
import type {MarketOrder} from './model';
import {marketMoney} from './format';
import {marketText} from './locale';
import {MarketCreditSummary} from './MarketCreditSummary';
function CreditCard({o,disabled,onCredit}:{o:MarketOrder;disabled:boolean;onCredit:(fields:Record<string,unknown>)=>void}){
 const {locale}=useStaffLocale(),t=(k:string)=>marketText(locale,k),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[consent,setConsent]=useState(false);
 let minor:string|null=null;try{minor=majorToMinor(amount);}catch{/* Invalid input remains unsent. */}
 const remaining=BigInt(o.totalMinor)-BigInt(o.creditedMinor||'0'),valid=minor!==null&&BigInt(minor)<=remaining&&reason.trim().length>=3&&consent;
 return <article className="localPanel" data-credit-order={o.orderId}><h3>#{o.orderId.slice(0,8)} · {o.unitCode}</h3><p>{t('total')}: {marketMoney(o.totalMinor,o.currency,locale)}</p>
 {o.issue&&<p>{o.issue.note}</p>}<MarketCreditSummary order={o} locale={locale}/><p>{t('creditRemaining')}: {marketMoney(remaining.toString(),o.currency,locale)}</p>
 {remaining>0n&&<form onSubmit={e=>{e.preventDefault();if(valid)onCredit({expectedRevision:o.revision,amountMinor:minor,reason:reason.trim()});}}><fieldset disabled={disabled}>
 <label>{t('creditAmount')}, {o.currency}<input inputMode="decimal" maxLength={20} value={amount} onChange={e=>{setAmount(e.target.value);setConsent(false);}}/></label>
 <label>{t('creditReason')}<textarea maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setConsent(false);}}/></label>
 <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('creditConsent')}</label><button disabled={!valid}>{t('recordCredit')}</button>
 </fieldset></form>}</article>;
}
export function StaffMarketCredits({csrf,onPending}:{csrf:string;onPending:(v:boolean)=>void}){
 const {locale}=useStaffLocale(),t=(k:string)=>marketText(locale,k),[opened,setOpened]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[online,setOnline]=useState(navigator.onLine),[page,setPage]=useState<Page<MarketOrder>>({items:[],nextCursor:null});
 async function refresh(cursor?:string){setLoading(true);setError('');try{setPage(await request('service-orders/market/finance'+(cursor?'?cursor='+cursor:''),csrf));}catch{setPage({items:[],nextCursor:null});setError('unavailable');}finally{setLoading(false);}}
 const state=useCleaning(a=>request(a.route,csrf,a.body,a.key),()=>refresh(),onPending);
 useEffect(()=>{const f=()=>setOnline(navigator.onLine);window.addEventListener('online',f);window.addEventListener('offline',f);return()=>{window.removeEventListener('online',f);window.removeEventListener('offline',f);};},[]);
 const disabled=state.busy||!!state.pending||loading||!online;
 return <section className="localWorkspace" data-testid="market-finance"><h2>{t('marketFinance')}</h2><p>{t('creditOnly')}</p>
 {!opened?<button disabled={!online} onClick={()=>{setOpened(true);void refresh();}}>{t('openCredits')}</button>:<>
 {!online&&<p role="status">{t('offline')}</p>}{loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t(error)}</p>}{state.message&&<p role="status">{t(state.message)}</p>}
 {state.pending&&<button disabled={state.busy||!online} onClick={()=>void state.act(state.pending!)}>{t('retry')}</button>}
 {!loading&&!error&&!page.items.length&&<p>{t('empty')}</p>}{page.items.map(o=><CreditCard key={o.orderId+':'+o.revision} o={o} disabled={disabled} onCredit={body=>void state.act({route:`service-orders/market/${o.orderId}/credits`,body,key:crypto.randomUUID()})}/>)}
 <button disabled={disabled} onClick={()=>void refresh()}>{t('refresh')}</button>{page.nextCursor&&<button disabled={disabled} onClick={()=>void refresh(page.nextCursor!)}>{t('next')}</button>}</>}</section>;
}
