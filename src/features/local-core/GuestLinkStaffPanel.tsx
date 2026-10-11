import {useRef,useState} from 'react';
import {useStaffLocale} from './StaffLocale';
import {translate} from '../../i18n/messages';
import catalog from '../guest-auth/guest-link-translations.json';
import {request} from './LocalCoreWorkspace';
type Invitation={linkId:string;expiresAt:string;recipientEmail?:string;status?:string;token?:string;delivery?:'manual_handoff'};
export function GuestLinkStaffPanel({reservationId,csrf}:{reservationId:string;csrf:string}){
 const {locale}=useStaffLocale(),t=(s:string)=>translate(catalog,locale,s);
 const [email,setEmail]=useState(''),[issued,setIssued]=useState<Invitation|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[revoked,setRevoked]=useState(false);
 const attempt=useRef<{email:string;key:string}|null>(null),running=useRef(false);
 const route='reservations/'+reservationId+'/guest-link';
 function failed(e:unknown){setError(e instanceof Error&&e.message==='GUEST_LINK_DISABLED'?'Booking linking is not connected on this server.':'The operation was not confirmed. Retry manually with the same code.');}
 async function inspect(){if(running.current)return;running.current=true;setBusy(true);setError('');try{const r=await request<{invitation:Invitation|null}>(route,csrf);setIssued(r.invitation);}catch(e){failed(e);}finally{running.current=false;setBusy(false);}}
 async function issue(){
  if(running.current)return;running.current=true;setBusy(true);setError('');setRevoked(false);
  if(!attempt.current)attempt.current={email:email.trim().toLowerCase(),key:crypto.randomUUID()};
  try{
   const value=await request<Invitation>(route,csrf,{email:attempt.current.email},attempt.current.key);
   if(value.delivery!=='manual_handoff'||!/^vglk_[A-Za-z0-9_-]{43}$/.test(value.token||''))throw Error('INVALID_RESPONSE');setIssued(value);
  }catch(e){failed(e);}finally{setBusy(false);running.current=false;}
 }
 async function revoke(){if(!issued||running.current)return;running.current=true;setBusy(true);setError('');try{
  await request(route+'/revoke',csrf,{linkId:issued.linkId});setIssued(null);setRevoked(true);attempt.current=null;
 }catch(e){failed(e);}finally{setBusy(false);running.current=false;}}
 const active=issued&&!['revoked','expired'].includes(issued.status||'pending');
 return <details className="localPanel" onToggle={e=>{if(e.currentTarget.open)void inspect();}}><summary>{t('Guest booking invitation')}</summary>
  <p>{t('Verify the guest and account email before issuing. Hand the code only to this guest. No email is sent automatically.')}</p>
  {error&&<p role="alert">{t(error)}</p>}{revoked&&<p role="status">{t('Invitation and its access revoked.')}</p>}
  {!active?<form onSubmit={e=>{e.preventDefault();void issue();}}><label>{t('Recipient email')}<input type="email" required maxLength={254} autoComplete="off" value={email} disabled={busy||!!attempt.current} onChange={e=>setEmail(e.target.value)}/></label>
   <button disabled={busy}>{t('Issue invitation')}</button><button type="button" disabled={busy} onClick={()=>{attempt.current=null;setError('');setEmail('');}}>{t('Change recipient')}</button></form>:<>
   {issued.token?<label>{t('Invitation code')}<input readOnly autoComplete="off" value={issued.token} onFocus={e=>e.target.select()}/></label>:<p>{t('An invitation exists. Revoke it before issuing a replacement.')} {issued.recipientEmail}</p>}
   {issued.status==='accepted'?<p>{t('Accepted. Access remains until revoked.')}</p>:<p>{t('Expires at')}: {new Date(issued.expiresAt).toLocaleString(locale)}</p>}<button disabled={busy} onClick={()=>void revoke()}>{t('Revoke this invitation')}</button>
  </>}
  <button disabled={busy} onClick={()=>void inspect()}>{t('Refresh invitation')}</button>
 </details>;
}
