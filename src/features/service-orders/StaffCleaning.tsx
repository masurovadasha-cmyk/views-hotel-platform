import {useEffect,useState} from 'react';
import {request} from '../local-core/LocalCoreWorkspace';
import {useStaffLocale} from '../local-core/StaffLocale';
import {formatStaffMoney,localizedName} from '../local-core/staff-locale';
import {cleaningText} from './locale';
import {useCleaning} from './useCleaning';
import type {CleaningOrder,Page} from './model';
export function StaffCleaning({csrf,manager}:{csrf:string;manager:boolean}){
 const {locale}=useStaffLocale(),t=(k:string)=>cleaningText(locale,k);
 const [opened,setOpened]=useState(false);
 const [page,setPage]=useState<Page<CleaningOrder>>({items:[],nextCursor:null}),[workers,setWorkers]=useState<{id:string;name:string}[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[online,setOnline]=useState(navigator.onLine);
 async function refresh(cursor?:string){setLoading(true);setError('');try{setPage(await request('service-orders'+(cursor?'?cursor='+cursor:''),csrf));if(manager)setWorkers((await request<{items:{id:string;name:string}[]}>('service-orders/assignees',csrf)).items);}catch{setPage({items:[],nextCursor:null});setWorkers([]);setError('unavailable');}finally{setLoading(false);}}
 const state=useCleaning(a=>request(a.route,csrf,a.body,a.key),()=>refresh());
 useEffect(()=>{const network=()=>setOnline(navigator.onLine);window.addEventListener('online',network);window.addEventListener('offline',network);return()=>{window.removeEventListener('online',network);window.removeEventListener('offline',network);};},[csrf]);
 const disabled=state.busy||!!state.pending||!online||loading;
 return <section className="localWorkspace" id="staff-service-orders" data-testid="staff-cleaning"><h2>{t('title')}</h2><p className="localWarning">{t('pilot')}</p>
 {!opened?<button disabled={!online} onClick={()=>{setOpened(true);void refresh();}}>{t('open')}</button>:<>
 {!online&&<p role="status">{t('offline')}</p>}{error&&<p role="alert">{t(error)}</p>}{state.message&&<p role="status">{t(state.message)}</p>}
 {state.pending&&<button disabled={state.busy||!online} onClick={()=>void state.act(state.pending!)}>{t('retry')}</button>}
 {workers.length>500&&<p>{t('limited')}</p>}{!page.items.length&&!error&&<p>{t('empty')}</p>}
 {page.items.map(o=><Order key={o.orderId+':'+o.revision} order={o} manager={manager} workers={workers.slice(0,500)} disabled={disabled} onAct={(action,fields)=>void state.act({route:'service-orders/'+o.orderId+'/actions',key:crypto.randomUUID(),body:{action,expectedRevision:o.revision,...fields}})}/>)}
 <button disabled={disabled} onClick={()=>void refresh()}>{t('refresh')}</button>{page.nextCursor&&<button disabled={disabled} onClick={()=>void refresh(page.nextCursor!)}>{t('next')}</button>}</>}</section>;
}
function Order({order:o,manager,workers,disabled,onAct}:{order:CleaningOrder;manager:boolean;workers:{id:string;name:string}[];disabled:boolean;onAct:(action:string,fields:Record<string,unknown>)=>void}){
 const {locale}=useStaffLocale(),t=(k:string)=>cleaningText(locale,k);const [worker,setWorker]=useState(''),[note,setNote]=useState(''),[accept,setAccept]=useState(false),[check,setCheck]=useState({linen:false,bathroom:false,floor:false});
 return <article className="localPanel"><h3>{localizedName(o.name,locale)}</h3><p>{t(o.stage)} · {formatStaffMoney(o.totalMinor,locale).replace(/UZS$/,o.currency)}</p><p>{t('unit')}: {o.unitCode||'—'}</p><time>{new Date(o.requestedFor).toLocaleString(locale)}</time>
 {o.completionNote&&<p>{o.completionNote}</p>}{o.inspectionNote&&<p>{o.inspectionNote}</p>}
 <fieldset disabled={disabled}>
 {manager&&['requested','assigned'].includes(o.stage)&&<><label>{t('worker')}<select aria-label={t('worker')} value={worker} onChange={e=>setWorker(e.target.value)}><option value="">—</option>{workers.map(w=><option key={w.id} value={w.id}>{w.name||w.id}</option>)}</select></label><button disabled={!worker} onClick={()=>onAct('assign',{assigneeId:worker})}>{t('assign')}</button></>}
 {!manager&&['assigned','rework'].includes(o.stage)&&<button onClick={()=>onAct('start',{})}>{t('start')}</button>}
 {((!manager&&o.stage==='working')||(manager&&['inspection','requested','assigned'].includes(o.stage)))&&<label>{t('note')}<textarea maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>}
 {!manager&&o.stage==='working'&&<>{(['linen','bathroom','floor'] as const).map(k=><label key={k}><input type="checkbox" checked={check[k]} onChange={e=>setCheck({...check,[k]:e.target.checked})}/>{t(k)}</label>)}<button disabled={!note.trim()||!Object.values(check).every(Boolean)} onClick={()=>onAct('submit',{note,checklist:check})}>{t('submit')}</button></>}
 {manager&&o.stage==='inspection'&&<><label><input type="checkbox" checked={accept} onChange={e=>setAccept(e.target.checked)}/>{t('accept')}</label><button disabled={!note.trim()||!accept} onClick={()=>onAct('approve',{note})}>{t('approve')}</button><button disabled={!note.trim()} onClick={()=>onAct('reject',{note})}>{t('reject')}</button></>}
 {manager&&['requested','assigned'].includes(o.stage)&&<button disabled={!note.trim()} onClick={()=>onAct('cancel',{note})}>{t('cancel')}</button>}
 </fieldset></article>;
}
