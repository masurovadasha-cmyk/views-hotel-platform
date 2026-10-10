import {useEffect,useRef,useState} from 'react';
import {folioApi,folioMoney,majorToMinor,type ChargeBody,type FolioDetail} from './folio-workspace-api';
import {definitiveFolioError,folioError,useFolioLocale} from './FolioWorkspaceLocale';
import {localeTags,localizedName} from './staff-locale';
type Attempt={action:'charges';body:ChargeBody;key:string}|{action:'reversals';body:{entryId:string;reason:string};key:string};
type Props={reservationId:string;staffCsrf:string;canManage:boolean;online:boolean;blocked:boolean;timezone:string;onPending:(value:boolean)=>void;onChanged:()=>void};
export function FolioWorkspaceDetail({reservationId,staffCsrf,canManage,online,blocked,timezone,onPending,onChanged}:Props){
 const {locale,t}=useFolioLocale();const [data,setData]=useState<FolioDetail|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [kind,setKind]=useState<ChargeBody['kind']>('service'),[amount,setAmount]=useState(''),[label,setLabel]=useState(''),[entryId,setEntryId]=useState(''),[reason,setReason]=useState(''),[attempt,setAttempt]=useState<Attempt|null>(null);
 const running=useRef(false),generation=useRef(0);
 useEffect(()=>{void load();return()=>{generation.current++;};},[]);
 async function load(cursor?:string){
  if(running.current||!online||attempt||blocked)return;running.current=true;setBusy(true);setError('');const turn=generation.current;setData(null);
  try{const next=await folioApi.detail(staffCsrf,reservationId,cursor);if(generation.current===turn){setData(next);setEntryId('');setReason('');}}
  catch(e){if(generation.current===turn)setError(folioError(e));}finally{running.current=false;if(generation.current===turn)setBusy(false);}
 }
 async function save(command:Attempt){
  if(running.current||!online||blocked)return;running.current=true;setBusy(true);setError('');setNotice('');setAttempt(command);onPending(true);const turn=generation.current;
  try{await folioApi.entry(staffCsrf,reservationId,command.action,command.body,command.key);if(generation.current!==turn)return;
   setAttempt(null);onPending(false);setAmount('');setLabel('');setEntryId('');setReason('');setNotice('The folio entry was recorded. No payment was sent.');onChanged();
   try{const next=await folioApi.detail(staffCsrf,reservationId);if(generation.current===turn)setData(next);}catch{if(generation.current===turn){setData(null);setError('The entry was saved, but the folio could not be refreshed. Reload it.');}}
  }catch(e){if(generation.current!==turn)return;setError(folioError(e));if(definitiveFolioError(e)){setAttempt(null);setData(null);onPending(false);}}
  finally{running.current=false;if(generation.current===turn)setBusy(false);}
 }
 function charge(){try{void save({action:'charges',key:crypto.randomUUID(),body:{kind,amountMinor:majorToMinor(amount),label:label.trim()}});}catch(e){setError(folioError(e));}}
 const locked=busy||blocked||!!attempt||!online;
 const reversible=data?.items.filter(item=>!item.reversed&&!item.reversalOf&&['manual_charge','night_audit'].includes(item.sourceType)&&BigInt(item.amountMinor)>0n)||[];
 return <section className="localPanel folioDetail" data-testid="folio-detail" aria-busy={busy}>
  <h2>{t('Guest folio')}{data?' · '+data.folio.confirmationCode:''}</h2>
  {error&&<p role="alert" className="localError">{t(error)}</p>}{notice&&<p role="status" className="localSuccess">{t(notice)}</p>}
  {attempt&&<button data-testid="folio-retry" disabled={busy||!online||blocked} onClick={()=>void save(attempt)}>{t('Retry the same entry')}</button>}
  <button disabled={locked} onClick={()=>void load()}>{t('Reload folio')}</button>
  {data&&<><p>{t(data.folio.status==='closed'?'Closed':data.folio.status==='open'?'Open':'Not opened')}{' · '}{t('Operational charges balance')}: <strong>{folioMoney(data.folio.balanceMinor,data.folio.currency,locale)}</strong></p>
   <p>{t('Total entries')}: {data.folio.entryCount}</p>
   {!data.items.length&&<p>{t('No entries on this page.')}</p>}
   <ul className="folioEntries">{data.items.map(item=><li key={item.id} data-testid="folio-entry">
    <strong>{localizedName(item.label,locale)} · {folioMoney(item.amountMinor,data.folio.currency,locale)}</strong>
    {item.businessDate&&<p>{t('Business date')}: {item.businessDate}</p>}
    <p>{t(item.kind)}{' · '}{new Intl.DateTimeFormat(localeTags[locale],{timeZone:timezone,dateStyle:'short',timeStyle:'short'}).format(new Date(item.createdAt))}{item.reversed?' · '+t('Reversed'):''}</p>
   </li>)}</ul>
   {data.nextCursor&&<button disabled={locked} onClick={()=>void load(data.nextCursor!)}>{t('Next entries')}</button>}
   {canManage&&data.folio.status!=='closed'&&['UZS','USD','EUR'].includes(data.folio.currency)&&<form data-testid="folio-charge-form" onSubmit={e=>{e.preventDefault();charge();}}><fieldset disabled={locked}>
    <legend>{t('Manual charge')}</legend><label>{t('Charge type')}<select value={kind} onChange={e=>setKind(e.target.value as ChargeBody['kind'])}><option value="service">{t('service')}</option><option value="minibar">{t('minibar')}</option><option value="fee">{t('fee')}</option></select></label>
    <label>{t('Amount')}, {data.folio.currency}<input required inputMode="decimal" maxLength={20} value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <label>{t('Description')}<input required maxLength={120} value={label} onChange={e=>setLabel(e.target.value)}/></label>
    <p className="localHint">{t('Use a service description, without passport data or card details.')}</p><button className="primary" type="submit" disabled={!label.trim()}>{t('Record charge')}</button>
   </fieldset></form>}
   {canManage&&data.folio.status!=='closed'&&reversible.length>0&&<form data-testid="folio-reversal-form" onSubmit={e=>{e.preventDefault();void save({action:'reversals',key:crypto.randomUUID(),body:{entryId,reason:reason.trim()}});}}><fieldset disabled={locked}>
    <legend>{t('Reverse an operational charge')}</legend><label>{t('Entry on this page')}<select required value={entryId} onChange={e=>setEntryId(e.target.value)}><option value="">{t('Choose an entry')}</option>{reversible.map(item=><option key={item.id} value={item.id}>{localizedName(item.label,locale)} · {folioMoney(item.amountMinor,data.folio.currency,locale)}</option>)}</select></label>
    <label>{t('Reason')}<input required maxLength={120} value={reason} onChange={e=>setReason(e.target.value)}/></label><p>{t('Reversal adds an opposite entry and keeps the original. It does not refund a payment.')}</p>
    <button type="submit" disabled={!entryId||!reason.trim()}>{t('Confirm reversal')}</button>
   </fieldset></form>}
  </>}
 </section>;
}
