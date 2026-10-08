import {useEffect,useRef,useState} from 'react';
import {folioApi,folioMoney,type AuditPreview,type AuditReceipt,type FolioProperty} from './folio-workspace-api';
import {definitiveFolioError,folioError,useFolioLocale} from './FolioWorkspaceLocale';
import {localizedName} from './staff-locale';
type Attempt={key:string;body:{propertyId:string;businessDate:string;expectedRevision:string}};
export function FolioWorkspaceAudit({property,staffCsrf,canManage,online,blocked,onPending,onChanged}:{property:FolioProperty;staffCsrf:string;canManage:boolean;online:boolean;blocked:boolean;onPending:(value:boolean)=>void;onChanged:()=>void}){
 const {locale,t}=useFolioLocale();const [date,setDate]=useState(''),[preview,setPreview]=useState<AuditPreview|null>(null),[receipt,setReceipt]=useState<AuditReceipt|null>(null),[attempt,setAttempt]=useState<Attempt|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const running=useRef(false),generation=useRef(0);useEffect(()=>()=>{generation.current++;},[]);
 async function inspect(){
  if(running.current||!online||blocked||attempt)return;running.current=true;setBusy(true);setError('');setPreview(null);setReceipt(null);const turn=generation.current;
  try{const next=await folioApi.audit(staffCsrf,property.id,date);if(generation.current===turn)setPreview(next);}catch(e){if(generation.current===turn)setError(folioError(e));}finally{running.current=false;if(generation.current===turn)setBusy(false);}
 }
 async function post(){
  if(running.current||!online||blocked||!preview||!canManage||(!attempt&&(preview.unresolvedCount>0||preview.invalidSnapshotCount>0||preview.scopeChanged)))return;
  const command=attempt||{key:crypto.randomUUID(),body:{propertyId:preview.propertyId,businessDate:preview.businessDate,expectedRevision:preview.revision}};setAttempt(command);onPending(true);running.current=true;setBusy(true);setError('');const turn=generation.current;
  try{const result=await folioApi.runAudit(staffCsrf,command.body,command.key);if(generation.current!==turn)return;setReceipt(result);setPreview(null);setAttempt(null);onPending(false);onChanged();}
  catch(e){if(generation.current!==turn)return;setError(folioError(e));if(definitiveFolioError(e)){setAttempt(null);setPreview(null);onPending(false);}}
  finally{running.current=false;if(generation.current===turn)setBusy(false);}
 }
 const run=receipt||preview?.run,locked=busy||blocked||!online||!!attempt;
 return <section className="localPanel folioAudit" data-testid="folio-audit" aria-busy={busy}>
  <h2>{t('Manual night audit')}</h2><p>{t('Property')}: <strong>{localizedName(property.name,locale)}</strong> · {property.timezone}</p>
  <p>{t('Only accommodation is posted. This is not a cash close, fiscal receipt or general ledger posting. Nothing runs automatically.')}</p>
  {error&&<p className="localError" role="alert">{t(error)}</p>}
  <form onSubmit={e=>{e.preventDefault();void inspect();}}><fieldset disabled={locked}><label>{t('Completed business date')}<input required type="date" value={date} onChange={e=>{setDate(e.target.value);setPreview(null);setReceipt(null);setError('');}}/></label><button data-testid="folio-audit-preview-button" type="submit">{t('Preview night audit')}</button></fieldset></form>
  {preview&&<div data-testid="folio-audit-preview"><h3>{t('Review before posting')}</h3><p>{preview.businessDate} · {preview.timezone}</p><dl><dt>{t('Eligible reservations')}</dt><dd>{preview.eligibleCount}</dd><dt>{t('Unresolved arrivals')}</dt><dd>{preview.unresolvedCount}</dd><dt>{t('Invalid booking snapshots')}</dt><dd>{preview.invalidSnapshotCount}</dd></dl>
   {preview.scopeChanged&&<p className="localError" role="alert">{t('The set of bookings differs from the recorded audit. Reconciliation is required.')}</p>}
   {preview.invalidSnapshotCount>0&&<p className="localError" role="alert">{t('Some booking snapshots are invalid. Reconcile them before posting.')}</p>}
   {preview.unresolvedCount>0&&<p className="localError" role="alert">{t('Resolve pending arrivals before posting the night audit.')}</p>}
   <p>{t('Confirm posting accommodation for this property and date. If the underlying bookings change, a new preview is required.')}</p>
   {canManage&&!run&&<button className="primary" data-testid="folio-audit-confirm" disabled={busy||!online||blocked||(!attempt&&(preview.unresolvedCount>0||preview.invalidSnapshotCount>0||preview.scopeChanged))} onClick={()=>void post()}>{t(attempt?'Retry the same audit':'Confirm night audit')}</button>}
  </div>}
  {run&&<div role="status" data-testid="folio-audit-result"><h3>{t('Night audit recorded')}</h3><p>{receipt?.businessDate||preview?.businessDate}</p><dl><dt>{t('Reservations processed')}</dt><dd>{run.reservationCount}</dd><dt>{t('Charges posted')}</dt><dd>{run.postedCount}</dd><dt>{t('Zero amount nights')}</dt><dd>{run.zeroAmountCount}</dd></dl>
   <ul>{run.totals.map(total=><li key={total.currency}>{folioMoney(total.amountMinor,total.currency,locale)}</li>)}</ul><p>{t('No payment was collected or sent by this operation.')}</p></div>}
 </section>;
}
