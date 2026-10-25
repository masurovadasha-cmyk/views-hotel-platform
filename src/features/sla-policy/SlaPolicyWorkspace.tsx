import {useEffect,useRef,useState} from 'react';
import {request} from '../local-core/LocalCoreWorkspace';
import {useStaffLocale} from '../local-core/StaffLocale';
import {parseRecoveryScope,recoveryScopeKey,type RecoveryScope} from '../local-core/booking-recovery';
import {kinds,stages,zones,defaults,parsePolicy,parseVersion,parseReceipt,parseSimulation,loadIntent,claimIntent,clearIntent,type Policy,type Version,type Intent,type Simulation} from './model';
import {translator,weekdays} from './locale';
import './sla-policy.css';
type Props={propertyId:string;staffCsrf:string};
const clock=(n:number)=>`${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toString().padStart(2,'0')}`;
const minute=(s:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):s==='24:00'?1440:NaN;
export function SlaPolicyWorkspace(props:Props){return <Workspace key={props.propertyId+':'+props.staffCsrf} {...props}/>;}
function Workspace({propertyId,staffCsrf}:Props){
 const {locale}=useStaffLocale(),t=translator(locale),[rows,setRows]=useState<Version[]>([]),[scope,setScope]=useState<RecoveryScope|null>(null),[form,setForm]=useState<Policy>(defaults()),[revision,setRevision]=useState(0),[pending,setPending]=useState<Intent|null>(null),[busy,setBusy]=useState(true),[storage,setStorage]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[receiptInfo,setReceiptInfo]=useState<{applied:number|null;current:number}|null>(null),[epoch,setEpoch]=useState(0),[startLocal,setStartLocal]=useState(''),[simulation,setSimulation]=useState<Simulation|null>(null);
 const alive=useRef(true),mutating=useRef(false),dirty=useRef(false),identity=useRef('');
 const locked=busy||!!pending||storage||!scope;
 const apply=(value:Version|null,p:Policy=form)=>{setEpoch(e=>e+1);setForm(value?.config||defaults(p.serviceKind,p.milestone));setRevision(value?.revision||0);setSimulation(null);dirty.current=false;};
 async function load(reset=false){
  const raw=await request<{draftOnly:boolean;approved:boolean;recoveryScope:unknown;policies:unknown[]}>('sla-policy?propertyId='+encodeURIComponent(propertyId),staffCsrf);
  if(!alive.current)return;if(raw.draftOnly!==true||raw.approved!==false||!Array.isArray(raw.policies)||raw.policies.length>12)throw Error('INVALID_RESPONSE');
  const next=parseRecoveryScope(raw.recoveryScope);if(next.propertyId!==propertyId)throw Error('INVALID_RESPONSE');const current=raw.policies.map(parseVersion),seen=new Set(current.map(v=>v.config.serviceKind+':'+v.config.milestone));if(seen.size!==current.length)throw Error('INVALID_RESPONSE');
  const key=recoveryScopeKey(next);if(identity.current&&identity.current!==key){setRows([]);setPending(null);setScope(null);setNotice('');apply(null);dirty.current=false;}identity.current=key;
  try{const saved=await loadIntent(next);if(!alive.current)return;setRows(current);setScope(next);setPending(saved);setStorage(false);if(saved){setForm(saved.body.policy);setRevision(saved.body.expectedRevision);setSimulation(null);}else if(reset||!dirty.current)apply(current.find(v=>v.config.serviceKind===form.serviceKind&&v.config.milestone===form.milestone)||null);}
  catch{if(alive.current){setStorage(true);setScope(null);setRows([]);setSimulation(null);}}
 }
 useEffect(()=>{alive.current=true;void load(true).catch(()=>{if(alive.current)setError('error');}).finally(()=>{if(alive.current)setBusy(false);});return()=>{alive.current=false;};},[]);
 const change=(next:Policy)=>{if(locked||mutating.current)return;dirty.current=true;setForm(next);setSimulation(null);setNotice('');};
 const select=(kind:Policy['serviceKind'],stage:Policy['milestone'])=>{if(locked||mutating.current||dirty.current&&!window.confirm(t('discard')))return;apply(rows.find(v=>v.config.serviceKind===kind&&v.config.milestone===stage)||null,{...form,serviceKind:kind,milestone:stage});};
 async function refresh(){if(mutating.current)return;setBusy(true);setError('');try{await load();}catch{setRows([]);setScope(null);setSimulation(null);setError('error');}finally{if(alive.current)setBusy(false);}}
 async function save(){if(busy||storage||!scope||mutating.current)return;let body;try{body={propertyId,expectedRevision:revision,policy:parsePolicy(form)};}catch{setError('invalid');return;}
  const desired=pending||{version:1 as const,scope,key:crypto.randomUUID(),body},recovering=!!pending;mutating.current=true;setBusy(true);setError('');setNotice('');setSimulation(null);let attempt:Intent;
  try{attempt=await claimIntent(desired);if(!alive.current)return;setPending(attempt);setForm(attempt.body.policy);setRevision(attempt.body.expectedRevision);if(attempt.key!==desired.key){mutating.current=false;setBusy(false);return;}}
  catch{setStorage(true);mutating.current=false;setBusy(false);return;}finally{if(!alive.current)mutating.current=false;}
  try{const result=parseReceipt(await request('sla-policy/drafts',staffCsrf,{...attempt.body,...recovering?{recoveryOnly:true}:{}},attempt.key),attempt);if(!alive.current)return;
   setNotice(result.outcome==='saved'?'saved':'absent');setReceiptInfo({applied:result.appliedRevision,current:result.current?.revision||0});try{await clearIntent(attempt);if(alive.current){setPending(null);apply(result.current,attempt.body.policy);}}catch{if(alive.current)setStorage(true);}
   try{await load();}catch{if(alive.current)setError('refreshFailed');}
  }catch{if(alive.current)setError('error');}finally{mutating.current=false;if(alive.current)setBusy(false);}
 }
 async function preview(){if(locked||mutating.current||!revision||dirty.current||!startLocal)return;const version={revision,config:form,createdAt:new Date().toISOString()};setBusy(true);setError('');setSimulation(null);try{const result=await request('sla-policy/simulate',staffCsrf,{propertyId,serviceKind:form.serviceKind,milestone:form.milestone,revision,startLocal});if(alive.current)setSimulation(parseSimulation(result,propertyId,version));}catch(e){const code=e instanceof Error?e.message:'';if(alive.current)setError(code.startsWith('SLA_LOCAL_TIME')?'dst':code==='SLA_SIMULATION_HORIZON'?'horizon':'error');}finally{if(alive.current)setBusy(false);}}
 return <section className="localPanel slaPolicy" data-testid="sla-policy"><h2>{t('title')}</h2><p className="localWarning">{t('notice')}</p>
  {error&&<p role="alert">{t(error as Parameters<typeof t>[0])}</p>}{notice&&<div role="status" data-testid="sla-policy-receipt"><p>{t(notice as Parameters<typeof t>[0])}</p>{receiptInfo&&<p>{t('applied')}: {receiptInfo.applied??'—'} · {t('current')}: {receiptInfo.current}</p>}</div>}
  {storage&&<p role="alert" data-testid="sla-policy-storage-error">{t('storage')}</p>}
  <button disabled={busy} onClick={()=>void refresh()}>{t('refresh')}</button>
  {pending&&<div data-testid="sla-policy-recovery"><p>{t('pending')} {t(pending.body.policy.serviceKind)} · {t(pending.body.policy.milestone)}</p><button data-testid="sla-policy-retry" disabled={busy||storage||!scope} onClick={()=>void save()}>{t('retry')}</button></div>}
  <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={locked}>
   <label>{t('service')}<select value={form.serviceKind} onChange={e=>select(e.target.value as Policy['serviceKind'],form.milestone)}>{kinds.map(k=><option key={k} value={k}>{t(k)}</option>)}</select></label>
   <label>{t('milestone')}<select value={form.milestone} onChange={e=>select(form.serviceKind,e.target.value as Policy['milestone'])}>{stages.map(k=><option key={k} value={k}>{t(k)}</option>)}</select></label>
   <label>{t('timezone')}<select value={form.timezone} onChange={e=>change({...form,timezone:e.target.value as Policy['timezone']})}>{zones.map(z=><option key={z}>{z}</option>)}</select></label>
   <label>{t('minutes')}<input type="number" min="1" max="1440" required value={form.targetMinutes} onChange={e=>change({...form,targetMinutes:Number(e.target.value)})}/></label>
   {form.windows.map((w,i)=><div className="slaWindow" key={epoch+':'+i}>
    <label>{t('day')}<select value={w.day} onChange={e=>change({...form,windows:form.windows.map((v,n)=>n===i?{...v,day:Number(e.target.value)}:v)})}>{weekdays[locale].map((day,n)=><option key={n} value={n+1}>{day}</option>)}</select></label>
    <label>{t('start')}<input required key={'a'+clock(w.startMinute)} defaultValue={clock(w.startMinute)} onChange={()=>{dirty.current=true;setSimulation(null);}} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" onBlur={e=>{if(Number.isFinite(minute(e.target.value)))change({...form,windows:form.windows.map((v,n)=>n===i?{...v,startMinute:minute(e.target.value)}:v)});}}/></label>
    <label>{t('end')}<input required key={'b'+clock(w.endMinute)} defaultValue={clock(w.endMinute)} onChange={()=>{dirty.current=true;setSimulation(null);}} pattern="(([01][0-9]|2[0-3]):[0-5][0-9]|24:00)" onBlur={e=>{if(Number.isFinite(minute(e.target.value)))change({...form,windows:form.windows.map((v,n)=>n===i?{...v,endMinute:minute(e.target.value)}:v)});}}/></label>
    <button type="button" onClick={()=>change({...form,windows:form.windows.filter((_,n)=>n!==i)})}>{t('remove')}</button>
   </div>)}
   <button type="button" disabled={form.windows.length>=14} onClick={()=>change({...form,windows:[...form.windows,{day:6,startMinute:540,endMinute:1020}]})}>{t('add')}</button>
   <p>{t('revision')}: {revision}</p><button className="primary" data-testid="sla-policy-save">{t('save')}</button>
   <button type="button" onClick={()=>{if(!dirty.current||window.confirm(t('discard')))apply(rows.find(v=>v.config.serviceKind===form.serviceKind&&v.config.milestone===form.milestone)||null);}}>{t('cancel')}</button>
  </fieldset></form>
  <div className="slaSimulation"><label>{t('startLocal')}<input type="datetime-local" disabled={locked} value={startLocal} onChange={e=>{setStartLocal(e.target.value);setSimulation(null);}}/></label><button data-testid="sla-policy-simulate" disabled={locked||!revision||dirty.current||!startLocal} onClick={()=>void preview()}>{t('simulate')}</button></div>
  {simulation&&<div data-testid="sla-policy-result"><h3>{t('result')}</h3><p>{simulation.dueLocal} · {simulation.timezone} · UTC {simulation.dueAt}</p><p>{t('revision')}: {simulation.revision}</p><ol>{simulation.segments.map((s,i)=><li key={i}>{s.localStart} → {s.localEnd}: {s.minutes} min · UTC {s.start} → {s.end}</li>)}</ol></div>}
 </section>;
}
