import {useEffect,useRef,useState} from 'react';
import {guestEmailRequest,GuestEmailError} from '../../api/guest-email';
import {useGuestLocale} from '../guest/GuestLocale';
import {translate} from '../../i18n/messages';
import {localizedName,localeTags} from '../local-core/staff-locale';
import catalog from './guest-link-translations.json';
type Preview={reservationId:string;confirmationCode:string;checkInAt:string;checkOutAt:string;timezone:string;propertyName:Record<string,string>;accepted:boolean};
export function GuestReservationLink({csrf,online,onLinked,onExpired}:{csrf:string;online:boolean;onLinked:()=>void;onExpired:()=>void}){
 const {locale}=useGuestLocale(),t=(s:string)=>translate(catalog,locale,s);
 const [code,setCode]=useState(''),[preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 const running=useRef(false),generation=useRef(0);
 useEffect(()=>()=>{generation.current++;},[]);
 async function submit(accept:boolean){
  if(running.current||!online)return;running.current=true;const turn=generation.current;setBusy(true);setError('');setDone(false);
  try{
   const b=await guestEmailRequest('reservation-link/'+(accept?'accept':'preview'),{token:code.trim()},csrf);
   if(generation.current!==turn)return;
   if(typeof b.reservationId!=='string'||typeof b.confirmationCode!=='string'||typeof b.checkInAt!=='string'||typeof b.checkOutAt!=='string'||typeof b.timezone!=='string'||!b.propertyName||typeof b.propertyName!=='object'||typeof b.accepted!=='boolean')throw Error();
   if(accept){if(!b.accepted)throw Error();setCode('');setPreview(null);setDone(true);onLinked();}else setPreview(b as Preview);
  }catch(e){
   if(generation.current!==turn)return;
   if(e instanceof GuestEmailError&&e.code==='GUEST_EMAIL_SESSION_INVALID'){onExpired();return;}
   setError(e instanceof GuestEmailError&&e.code==='GUEST_LINK_INVALID'?'Invitation is invalid, expired, revoked or intended for another account.':e instanceof GuestEmailError&&e.code==='GUEST_LINK_DISABLED'?'Booking linking is not connected on this server.':'The operation was not confirmed. Retry manually with the same code.');
  }finally{running.current=false;if(generation.current===turn)setBusy(false);}
 }
 function date(value:string,zone:string){try{return new Intl.DateTimeFormat(localeTags[locale],{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(new Date(value));}catch{return value;}}
 return <section className="guestReservationLink" aria-label={t('Add an existing booking')}>
  <h2>{t('Add an existing booking')}</h2><p>{t('Ask reception for an invitation for your account email. The booking number alone is not enough. Invitations are handed over manually on this test stand.')}</p>
  {error&&<p role="alert">{t(error)}</p>}{done&&<p role="status">{t('Booking linked. Your trips have been refreshed.')}</p>}
  <form onSubmit={e=>{e.preventDefault();void submit(false);}}><label htmlFor="reservation-link-code">{t('Invitation code')}</label>
   <input id="reservation-link-code" type="password" autoComplete="off" spellCheck={false} maxLength={256} required value={code} disabled={busy||!online} onChange={e=>{setCode(e.target.value);setPreview(null);setDone(false);setError('');}}/>
   <button disabled={busy||!online||!/^vglk_[A-Za-z0-9_-]{43}$/.test(code.trim())}>{t('Check invitation')}</button></form>
  {preview&&<article data-testid="guest-link-preview"><h3>{localizedName(preview.propertyName,locale)}</h3><p>{preview.confirmationCode}</p>
   <p>{date(preview.checkInAt,preview.timezone)} — {date(preview.checkOutAt,preview.timezone)} ({preview.timezone})</p>
   <p>{t('Confirm only if this is your booking. Other bookings in the same guest profile will not be linked.')}</p>
   <button className="primary" disabled={busy||!online} onClick={()=>void submit(true)}>{t('Confirm booking link')}</button></article>}
 </section>;
}
