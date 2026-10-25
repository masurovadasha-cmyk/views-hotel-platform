import {useEffect,useRef,useState} from 'react';
import {useStaffLocale} from '../local-core/StaffLocale';
import {appendSection,parseQueue,type Kind,type Row,type Section} from './model';
import {queueText,stageText,type QueueLabel} from './locale';
import './queue.css';
export function OperationsQueue({csrf}:{csrf:string}){
 const {locale}=useStaffLocale(),t=(key:QueueLabel)=>queueText(locale,key);
 const [open,setOpen]=useState(false),[sections,setSections]=useState<Section[]>([]),[selected,setSelected]=useState<Row|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(false),[online,setOnline]=useState(navigator.onLine);
 const generation=useRef(0),pending=useRef(false),controller=useRef<AbortController|null>(null);
 function invalidate(){generation.current++;controller.current?.abort();controller.current=null;pending.current=false;setBusy(false);setSections([]);setSelected(null);}
 useEffect(()=>{
  const revoke=()=>{invalidate();setError(true);};
  const network=()=>{setOnline(navigator.onLine);if(!navigator.onLine)invalidate();};
  window.addEventListener('views-staff-expired',revoke);window.addEventListener('offline',network);window.addEventListener('online',network);
  return()=>{generation.current++;controller.current?.abort();window.removeEventListener('views-staff-expired',revoke);window.removeEventListener('offline',network);window.removeEventListener('online',network);};
 },[]);
 useEffect(()=>{invalidate();setOpen(false);setError(false);},[csrf]);
 async function load(kind?:Kind,cursor?:string){
  if(pending.current||!navigator.onLine)return;
  const seq=++generation.current;controller.current?.abort();const abort=new AbortController();controller.current=abort;
  const timer=setTimeout(()=>abort.abort(),15000);
  pending.current=true;setBusy(true);setError(false);setSelected(null);if(!kind)setSections([]);
  try{
   const q=new URLSearchParams();if(kind)q.set('kind',kind);if(cursor)q.set('cursor',cursor);
   const response=await fetch('/local-api/service-orders/queue'+(q.size?'?'+q:''),{headers:{'X-Views-Local-Workspace':'1'},credentials:'same-origin',signal:abort.signal,cache:'no-store'});
   if(seq!==generation.current)return;
   if(response.status===401||response.status===403){window.dispatchEvent(new Event('views-staff-expired'));return;}
   if(!response.ok)throw Error('QUEUE_UNAVAILABLE');
   const incoming=parseQueue(await response.json(),kind);if(seq!==generation.current)return;
   setSections(previous=>kind?previous.map(section=>section.kind===kind?appendSection(section,incoming[0]):section):incoming);
  }catch{if(seq===generation.current){setSections([]);setSelected(null);setError(true);}}
  finally{clearTimeout(timer);if(seq===generation.current){pending.current=false;setBusy(false);}}
 }
 function toggle(){if(open){invalidate();setOpen(false);setError(false);}else{setOpen(true);void load();}}
 return <section id="staff-service-queue" data-testid="staff-service-queue" className="localWorkspace operationsQueue">
  <h2>{t('title')}</h2><p>{t('notice')}</p>
  <button data-testid="queue-open" aria-expanded={open} onClick={toggle}>{t(open?'close':'open')}</button>
  {open&&<><button data-testid="queue-refresh" disabled={busy||!online} onClick={()=>void load()}>{t('refresh')}</button>
   {!online&&<p role="status">{t('offline')}</p>}{busy&&<p role="status">{t('loading')}</p>}{error&&<p role="alert" data-testid="queue-error">{t('error')}</p>}
   <div className="operationsQueueSections">{sections.map(section=><section key={section.kind} data-testid={'queue-'+section.kind} className="localPanel"><h3>{t(section.kind)}</h3>
    {section.status!=='available'?<p>{t(section.status)}</p>:<>
     {!section.items.length&&<p>{t('empty')}</p>}
     {section.items.map(row=><button className="queueOrder" key={row.id} data-testid={'queue-item-'+row.kind+'-'+row.id} disabled={busy||!online} onClick={()=>setSelected(row)}><strong>{row.unitCode??'—'}</strong><span>{stageText(locale,row.stage)} · <code>{row.stage}</code></span><code>{row.id}</code></button>)}
     {section.nextCursor&&<button data-testid={'queue-more-'+section.kind} disabled={busy||!online} onClick={()=>void load(section.kind,section.nextCursor!)}>{t('more')}</button>}
    </>}
   </section>)}</div>
   {selected&&<section data-testid="queue-detail" className="localPanel" aria-label={t('summary')}><h3>{t('summary')}</h3><p>{t('snapshot')}</p><dl>
    <dt>{t('id')}</dt><dd>{selected.id}</dd><dt>{t('unit')}</dt><dd>{selected.unitCode??'—'}</dd><dt>{t('stage')}</dt><dd>{stageText(locale,selected.stage)} · {selected.stage}</dd><dt>{t('revision')}</dt><dd>{selected.revision}</dd>
   </dl>{selected.sla?<><p>{t('deadline')}: <time dateTime={selected.sla.responseDueAt}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(selected.sla.responseDueAt))} UTC</time> · {stageText(locale,selected.sla.state)}</p><p>{t('slaNote')}</p></>:<p>{t('noSla')}</p>}
   <button data-testid="queue-close-detail" onClick={()=>setSelected(null)}>{t('dismiss')}</button></section>}
  </>}
 </section>;
}
