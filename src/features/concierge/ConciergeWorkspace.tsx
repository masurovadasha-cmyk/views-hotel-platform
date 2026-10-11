import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import type {Attempt} from '../service-orders/model';
import {useCleaning} from '../service-orders/useCleaning';
import {parseConciergePage,type ConciergeRequest} from './model';
import {conciergeText} from './locale';
import {ConciergeForm} from './ConciergeForm';
import {ConciergeConversation} from './ConciergeConversation';
import './concierge.css';
type Props={locale:Locale;staff:boolean;manager?:boolean;online:boolean;canRequest?:boolean;reservationId?:string;route:string;load:(cursor?:string)=>Promise<unknown>;send:(a:Attempt)=>Promise<unknown>;onPending:(v:boolean)=>void;onExpired?:()=>void};
export function ConciergeWorkspace(p:Props){
 const t=(k:string)=>conciergeText(p.locale,k),[formOpen,setFormOpen]=useState(true),[opened,setOpened]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[version,setVersion]=useState(0),[page,setPage]=useState<{items:ConciergeRequest[];nextCursor:string|null}>({items:[],nextCursor:null});
 async function refresh(cursor?:string){setLoading(true);setError('');try{setPage(parseConciergePage(await p.load(cursor)));}catch(e){setPage({items:[],nextCursor:null});if(e instanceof Error&&/SESSION_INVALID/.test(e.message))p.onExpired?.();else setError('unavailable');}finally{setLoading(false);}}
 const state=useCleaning(async a=>{const result=await p.send(a);if(a.route===p.route)setFormOpen(false);return result;},async()=>{setVersion(v=>v+1);await refresh();},p.onPending,p.onExpired),disabled=state.busy||!!state.pending||loading||!p.online;
 return <section className="localPanel conciergeWorkspace" data-testid={p.staff?'staff-concierge':'guest-concierge'}><h3>{t(p.staff?'inbox':'title')}</h3>
 {!opened?<button disabled={!p.online} onClick={()=>{setOpened(true);void refresh();}}>{t('open')}</button>:<>
 <p>{t('terms')}</p><p>{t('sla')}</p>{!p.online&&<p role="status">{t('offline')}</p>}{loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t(error)}</p>}{state.message&&<p role="status">{t(state.message)}</p>}
 {state.pending&&<button disabled={state.busy||!p.online} onClick={()=>void state.act(state.pending!)}>{t('retry')}</button>}
 {!p.staff&&p.canRequest&&!formOpen&&<button disabled={disabled} onClick={()=>setFormOpen(true)}>{t('newRequest')}</button>}
 {!p.staff&&p.canRequest&&formOpen&&<ConciergeForm key={version} locale={p.locale} disabled={disabled} onSubmit={fields=>void state.act({route:p.route,key:crypto.randomUUID(),body:{reservationId:p.reservationId,...fields}})}/>}
 {!loading&&!error&&!page.items.length&&<p>{t('empty')}</p>}
 {page.items.map(r=><ConciergeConversation key={r.orderId+':'+r.revision} order={r} locale={p.locale} staff={p.staff} manager={p.manager} disabled={disabled} onAction={(action,fields={})=>void state.act({route:p.route+'/'+r.orderId+'/actions',key:crypto.randomUUID(),body:{action,expectedRevision:r.revision,...fields}})}/>)}
 <button disabled={disabled} onClick={()=>void refresh()}>{t('refresh')}</button>{page.nextCursor&&<button disabled={disabled} onClick={()=>void refresh(page.nextCursor!)}>{t('next')}</button>}</>}</section>;
}
