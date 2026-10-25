import {useEffect,useRef,useState} from 'react';
import {assignment,dispatchOrder,page,receipt,PartnerApiError,scopeValid,uuid,type Assignment,type DispatchOrder,type Command,type Journal,type Locale,type PartnerAssignmentsApi,type PartnerDispatchApi,type Receipt} from './model';
import {transactJournal} from './journal';
import {translate} from './messages';
import './partner-assignments.css';
export type PartnerSession={scope:string};
export type DispatchSession=PartnerSession&{propertyId:string};
type Common={locale:Locale;onUnresolvedChange?:(pending:boolean)=>void};
export function PartnerAssignments(props:Common&{session:PartnerSession|null;api:PartnerAssignmentsApi|null}){return <Coordination {...props} mode="partner"/>;}
export function PartnerDispatch(props:Common&{session:DispatchSession|null;api:PartnerDispatchApi|null}){return <Coordination {...props} mode="dispatch"/>;}
type Review={kind:'decision';assignment:Assignment;action:'accept'|'reject'}|{kind:'offer';order:DispatchOrder};
const definitive=new Set(['PARTNER_REVISION_CHANGED','PARTNER_EXPIRED','PARTNER_TRANSITION_INVALID','PARTNER_ALREADY_ASSIGNED']);
function Coordination({locale,session,api,mode,onUnresolvedChange}:Common&{session:(PartnerSession&{propertyId?:string})|null;api:PartnerDispatchApi|PartnerAssignmentsApi|null;mode:'partner'|'dispatch'}){
 const t=(s:string)=>translate(locale,s),candidate=session&&scopeValid(session.scope)&&api&&(mode==='partner'||uuid(session.propertyId))?`${mode}:${session.scope}${mode==='dispatch'?':'+session.propertyId:''}`:'';
 const scope=scopeValid(candidate)?candidate:'';
 const [items,setItems]=useState<(Assignment|DispatchOrder)[]>([]),[next,setNext]=useState<string|null>(null),[journal,setJournal]=useState<Journal|null>(null),[loadedScope,setLoadedScope]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[online,setOnline]=useState(()=>navigator.onLine),[review,setReview]=useState<Review|null>(null),[grant,setGrant]=useState(''),[expiry,setExpiry]=useState(''),[result,setResult]=useState<Receipt|null>(null);
 const current=useRef(scope);current.current=scope;const generation=useRef(0),sending=useRef(false);
 const visible=loadedScope===scope&&!!scope,pending=visible?journal?.command:null,locked=busy||!online||!visible||!journal||!!pending||error==='journal';
 useEffect(()=>{const update=()=>setOnline(navigator.onLine);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 useEffect(()=>{onUnresolvedChange?.(!!pending||sending.current);return()=>onUnresolvedChange?.(false);},[!!pending,busy,onUnresolvedChange]);
 useEffect(()=>{if(!pending&&!sending.current)return;const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[!!pending,busy]);
 async function load(after?:string){if(!scope||!api||sending.current)return;const turn=++generation.current;setBusy(true);setReview(null);setResult(null);setError('');try{
  const state=await transactJournal(indexedDB,scope,{kind:'read'});if(turn!==generation.current||current.current!==scope)return;setJournal(state);setLoadedScope(scope);
  const raw=mode==='dispatch'?await(api as PartnerDispatchApi).list(session!.propertyId!,after):await(api as PartnerAssignmentsApi).list(after);if(turn!==generation.current||current.current!==scope)return;
  const projection=mode==='dispatch'?page(raw,dispatchOrder):page(raw,assignment);setItems(projection.items);setNext(projection.nextCursor);
 }catch(e){if(turn===generation.current&&current.current===scope){setItems([]);setNext(null);setError(e instanceof Error&&e.message==='journal'?'journal':'request');}}finally{if(turn===generation.current&&current.current===scope)setBusy(false);}}
 useEffect(()=>{generation.current++;setItems([]);setNext(null);setJournal(null);setLoadedScope('');setReview(null);setResult(null);setError('');setBusy(false);if(scope)void load();},[scope]);
 function choose(value:Review){if(locked)return;setReview(value);setGrant('');setExpiry('');setResult(null);setError('');}
 async function execute(recover=false){if(!scope||!api||sending.current||!online||!journal)return;const startScope=scope,startApi=api;let active=journal;sending.current=true;setBusy(true);setError('');let cmd:Command|undefined;
 try{
  if(recover){const latest=await transactJournal(indexedDB,startScope,{kind:'read'});if(latest.revision!==active.revision||latest.command?.key!==active.command?.key)throw Error('changed');active=latest;cmd=active.command??undefined;if(!cmd)throw Error('changed');}
  else{
   if(!review||active.command)return;
   const key=crypto.randomUUID();
   if(review.kind==='decision')cmd={kind:'decision',scope:startScope,key,assignmentId:review.assignment.assignmentId,body:{action:review.action,expectedRevision:review.assignment.revision,termsVersion:review.assignment.termsVersion}};
   else{if(!review.order.grants.some(g=>g.grantId===grant)||!expiry||!Number.isFinite(new Date(expiry).getTime())||new Date(expiry).getTime()<=Date.now())return;cmd={kind:'offer',scope:startScope,key,body:{orderId:review.order.orderId,grantId:grant,expectedOrderRevision:review.order.revision,expiresAt:new Date(expiry).toISOString()}};}
   active=await transactJournal(indexedDB,startScope,{kind:'reserve',revision:active.revision,command:cmd});
  }
  if(current.current!==startScope)return; // Intent stays durable; never send through a changed session.
  setJournal(active);setReview(null);
  const raw=cmd.kind==='offer'?await(startApi as PartnerDispatchApi).offer(cmd.body,cmd.key):await(startApi as PartnerAssignmentsApi).decide(cmd.assignmentId,cmd.body,cmd.key);
  const answer=receipt(raw);if(cmd.kind==='decision'&&answer.assignmentId!==cmd.assignmentId)throw Error('invalid-response');
  const settled=await transactJournal(indexedDB,startScope,{kind:'settle',revision:active.revision,key:cmd.key});
  if(current.current===startScope){setJournal(settled);setResult(answer);setItems([]);setNext(null);}
 }catch(e){
  if(cmd&&e instanceof PartnerApiError&&e.status===409&&definitive.has(e.code)){
   try{const settled=await transactJournal(indexedDB,startScope,{kind:'settle',revision:active.revision,key:cmd.key});if(current.current===startScope){setJournal(settled);setItems([]);setNext(null);setError('not-applied');}}catch{if(current.current===startScope)setError('journal');}
  }else if(current.current===startScope)setError(e instanceof Error&&e.message==='changed'?'changed':e instanceof Error&&e.message==='journal'?'journal':'request');
 }finally{sending.current=false;if(current.current===startScope)setBusy(false);}
 }
 const format=(iso:string)=>new Intl.DateTimeFormat({ru:'ru-RU',uz:'uz-Latn-UZ',en:'en-GB'}[locale],{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso));
 const issue=error==='journal'?'Local recovery storage is unavailable or invalid. Sending is blocked; nothing was reset.':error==='changed'?'The recovery record changed in another tab. Reload it before continuing.':error==='not-applied'?'Command was not applied. Refresh before reviewing a new command.':'Request failed. Existing command, if any, is retained.';
 return <section className="partnerAssignments" data-testid={'partner-'+mode}><h2>{t(mode==='dispatch'?'Partner dispatch':'Partner inbox')}</h2>{!scope?<p>{t('Disconnected. A separately authenticated local test session is required. No partner login or real service execution is available here.')}</p>:<>
 <p>{t('Synthetic coordination only. Acceptance is not fulfilment, delivery or a payment. No amounts or guest personal data are shown.')}</p>
 {!online&&<p role="alert">{t('Offline. Reconnect before sending or recovering.')}</p>}{busy&&<p role="status">{t('Loading…')}</p>}{error&&<p role="alert">{t(issue)}</p>}
 <button disabled={busy||!online} onClick={()=>void load()}>{t(pending||error==='journal'||error==='changed'?'Reload recovery record':'Refresh')}</button>
 {pending&&<article className="partnerRecovery"><p>{t('Unresolved command. Its result may already be committed. Recover using the same command; do not create a replacement.')}</p><code>{pending.key}</code><p>{t(pending.kind==='offer'?'offer':pending.body.action)}</p><button disabled={busy||!online||error==='journal'} onClick={()=>void execute(true)}>{t('Recover same command')}</button></article>}
 {visible&&result&&<article data-testid="partner-receipt"><h3>{t('Current server receipt')}</h3><code>{result.assignmentId}</code><p>{t(result.status)}</p><p>{t('Revision')}: {result.revision} · {t('Terms version')}: {result.termsVersion}</p>{result.idempotentReplay&&<p>{t('Idempotent replay')}</p>}</article>}
 {visible&&!busy&&!items.length&&!pending&&!result&&!error&&<p>{t('No eligible items.')}</p>}
 {visible&&items.map(item=>'assignmentId'in item?<article key={item.assignmentId}><code>{item.assignmentId}</code><h3>{t(item.kind)}</h3><p>{t(item.status)}</p><p>{t('Requested for')}: {format(item.requestedFor)}</p><p>{t('Expires')}: {format(item.expiresAt)}</p><p>{t('Revision')}: {item.revision} · {t('Terms version')}: {item.termsVersion}</p>{item.status==='offered'&&<><button disabled={locked} onClick={()=>choose({kind:'decision',assignment:item,action:'accept'})}>{t('Accept offer')}</button><button disabled={locked} onClick={()=>choose({kind:'decision',assignment:item,action:'reject'})}>{t('Reject offer')}</button></>}</article>:<article key={item.orderId}><code>{item.orderId}</code><h3>{t(item.kind)}</h3><p>{t('Requested for')}: {format(item.requestedFor)}</p><p>{t('Revision')}: {item.revision}</p>{item.grantsTruncated&&<p>{t('Only part of the eligible grant list is shown. This is not a complete partner registry.')}</p>}<button disabled={locked||!item.grants.length} onClick={()=>choose({kind:'offer',order:item})}>{t('Offer assignment')}</button></article>)}
 {visible&&next&&<button disabled={busy||!!pending||!online} onClick={()=>void load(next)}>{t('Next page')}</button>}
 {visible&&review&&<div className="partnerReview" role="region" aria-label={t('Review synthetic command')}><h3>{t('Review synthetic command')}</h3><code>{review.kind==='decision'?review.assignment.assignmentId:review.order.orderId}</code><p>{t(review.kind==='offer'?'offer':review.action)}</p>{review.kind==='offer'&&<><label>{t('Partner grant')}<select aria-label={t('Partner grant')} disabled={busy} value={grant} onChange={e=>setGrant(e.target.value)}><option value="">{t('Choose a grant')}</option>{review.order.grants.map(g=><option key={g.grantId} value={g.grantId}>{g.label}</option>)}</select></label><label>{t('Offer expires at')}<input disabled={busy} type="datetime-local" value={expiry} onChange={e=>setExpiry(e.target.value)}/></label><p>{t('Browser time zone')}: {Intl.DateTimeFormat().resolvedOptions().timeZone}</p></>}<button disabled={locked||(review.kind==='offer'&&(!grant||!expiry||!Number.isFinite(new Date(expiry).getTime())||new Date(expiry).getTime()<=Date.now()))} onClick={()=>void execute()}>{t('Confirm synthetic command')}</button><button disabled={busy} onClick={()=>setReview(null)}>{t('Cancel')}</button></div>}
 </>}</section>;
}
