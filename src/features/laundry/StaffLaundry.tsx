import {useEffect,useState} from 'react';
import {request} from '../local-core/LocalCoreWorkspace';
import {useStaffLocale} from '../local-core/StaffLocale';
import {useCleaning} from '../service-orders/useCleaning';
import type {Page} from '../service-orders/model';
import type {LaundryIntake} from './model';
import {laundryText} from './locale';
import {LaundrySummary} from './LaundrySummary';
import {LaundryQuoteForm} from './LaundryQuoteForm';
export function StaffLaundry({csrf,onPending}:{csrf:string;onPending:(v:boolean)=>void}){
 const {locale}=useStaffLocale(),t=(k:string)=>laundryText(locale,k);
 const [opened,setOpened]=useState(false),[loading,setLoading]=useState(false),[online,setOnline]=useState(navigator.onLine),[error,setError]=useState('');
 const [page,setPage]=useState<Page<LaundryIntake>>({items:[],nextCursor:null});
 async function refresh(cursor?:string){setLoading(true);setError('');try{setPage(await request('service-orders/laundry'+(cursor?'?cursor='+cursor:''),csrf));}catch{setPage({items:[],nextCursor:null});setError('unavailable');}finally{setLoading(false);}}
 const state=useCleaning(a=>request(a.route,csrf,a.body,a.key),()=>refresh(),onPending);
 useEffect(()=>{const network=()=>setOnline(navigator.onLine);window.addEventListener('online',network);window.addEventListener('offline',network);return()=>{window.removeEventListener('online',network);window.removeEventListener('offline',network);};},[]);
 const disabled=state.busy||!!state.pending||loading||!online;
 return <section className="localWorkspace" data-testid="staff-laundry"><h2>{t('title')}</h2>
 {!opened?<button disabled={!online} onClick={()=>{setOpened(true);void refresh();}}>{t('open')}</button>:<><p>{t('pilot')}</p>
 {!online&&<p role="status">{t('offline')}</p>}{loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t(error)}</p>}{state.message&&<p role="status">{t(state.message)}</p>}
 {state.pending&&<button disabled={state.busy||!online} onClick={()=>void state.act(state.pending!)}>{t('retry')}</button>}
 {!loading&&!error&&!page.items.length&&<p>{t('empty')}</p>}
 {page.items.map(o=><LaundryWork key={o.intakeId+':'+o.revision} intake={o} disabled={disabled} onAction={(action,fields={})=>void state.act({route:`service-orders/laundry/${o.intakeId}/actions`,key:crypto.randomUUID(),body:{action,expectedRevision:o.revision,...fields}})}/>)}
 <button disabled={disabled} onClick={()=>void refresh()}>{t('refresh')}</button>{page.nextCursor&&<button disabled={disabled} onClick={()=>void refresh(page.nextCursor!)}>{t('next')}</button>}</>}</section>;
}
function LaundryWork({intake:o,disabled,onAction}:{intake:LaundryIntake;disabled:boolean;onAction:(action:string,fields?:Record<string,unknown>)=>void}){
 const {locale}=useStaffLocale(),t=(k:string)=>laundryText(locale,k),[checked,setChecked]=useState(false);
 const action=({requested:'receive',accepted:'wash',washing:'ready',ready:'deliver'} as Record<string,string>)[o.stage];
 const returnable=['received','quoted','awaiting_return'].includes(o.stage);
 return <article className="localPanel" data-intake-id={o.intakeId}><LaundrySummary intake={o} locale={locale}/>
 {['received','quoted'].includes(o.stage)&&<LaundryQuoteForm intake={o} locale={locale} disabled={disabled} onQuote={fields=>onAction('quote',fields)}/>}
 {(action||returnable)&&<fieldset disabled={disabled}><label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>{t('physical')}</label>
 {action&&<button disabled={!checked} onClick={()=>onAction(action)}>{t(action==='ready'?'readyAction':action)}</button>}
 {returnable&&<button disabled={!checked} onClick={()=>onAction('return_unprocessed')}>{t('return_unprocessed')}</button>}</fieldset>}</article>;
}
