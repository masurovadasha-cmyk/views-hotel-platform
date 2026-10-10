import {useEffect,useRef,useState} from 'react';
import {GuestEmailError} from '../../api/guest-email';
import {useGuestLocale} from '../guest/GuestLocale';
import {translate} from '../../i18n/messages';
import {formatStaffMoney,localeTags} from '../local-core/staff-locale';
import {guestCancellation,type CancellationPreview,type CancellationReceipt} from './guest-cancellation-api';
import catalog from './guest-cancellation-translations.json';
import './guest-cancellation.css';
type Attempt={quote:CancellationPreview;key:string};
type Props={reservationId:string;status:string;csrf:string;online:boolean;onExpired:()=>void;onCancelled:()=>void;onResolutionPending:(pending:boolean)=>void};
export function GuestCancellation({reservationId,status,csrf,online,onExpired,onCancelled,onResolutionPending}:Props){
 const {locale}=useGuestLocale(),t=(s:string)=>translate(catalog,locale,s);
 const [quote,setQuote]=useState<CancellationPreview|null>(null),[receipt,setReceipt]=useState<CancellationReceipt|null>(null),[attempt,setAttempt]=useState<Attempt|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[unavailable,setUnavailable]=useState(false),[now,setNow]=useState(Date.now());
 const running=useRef(false),generation=useRef(0);
 useEffect(()=>()=>{generation.current++;},[]);
 useEffect(()=>{if(!quote)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[quote]);
 const expired=!!quote&&Date.parse(quote.expiresAt)<=now;
 function money(value:string,currency:string){return ['UZS','USD','EUR'].includes(currency)?formatStaffMoney(value,locale).replace(/UZS$/,currency):value+' '+currency+' '+t('(minor units)');}
 function date(value:string,timezone:string){return new Intl.DateTimeFormat(localeTags[locale],{dateStyle:'medium',timeStyle:'short',timeZone:timezone}).format(new Date(value));}
 function fail(e:unknown,confirm:boolean){
  const code=e instanceof GuestEmailError?e.code:'';
  if(code==='GUEST_EMAIL_SESSION_INVALID'){onResolutionPending(false);onExpired();return;}
  if(code==='GUEST_CANCELLATION_QUOTE_STALE'){
   setAttempt(null);setQuote(null);onResolutionPending(false);setError('The calculation expired or changed. Get a new calculation and confirm it separately.');return;
  }
  const known:Record<string,string>={
   GUEST_CANCELLATION_DISABLED:'Cancellation is not connected on this server.',
   GUEST_CANCELLATION_NOT_AVAILABLE:'This booking cannot be cancelled here. Refresh the trip or contact reception.',
   GUEST_CANCELLATION_RECONCILIATION_REQUIRED:'Reception needs to check the booking and payments before cancellation.',
   GUEST_CANCELLATION_COMMAND_CONFLICT:'Reception needs to check the booking and payments before cancellation.',
   GUEST_TRIP_NOT_FOUND:'This trip is no longer available to your account.'
  };
  if(known[code]){setAttempt(null);setQuote(null);onResolutionPending(false);setUnavailable(true);setError(known[code]);return;}
  setError(confirm?'The server did not confirm the result. Keep this trip open and retry the same cancellation request manually.':'Could not calculate cancellation. Try again manually.');
 }
 async function preview(){
  if(running.current||!online||attempt)return;running.current=true;const turn=generation.current;setBusy(true);setError('');setQuote(null);
  try{const next=await guestCancellation.preview(reservationId,csrf);if(generation.current===turn){setQuote(next);setNow(Date.now());}}
  catch(e){if(generation.current===turn)fail(e,false);}finally{running.current=false;if(generation.current===turn)setBusy(false);}
 }
 async function confirm(){
  if(running.current||!online||!quote||(!attempt&&expired))return;
  const command=attempt||{quote,key:crypto.randomUUID()};setAttempt(command);onResolutionPending(true);running.current=true;const turn=generation.current;setBusy(true);setError('');
  try{const next=await guestCancellation.confirm(command.quote,csrf,command.key);if(generation.current!==turn)return;setReceipt(next);setQuote(null);setAttempt(null);onResolutionPending(false);onCancelled();}
  catch(e){if(generation.current===turn)fail(e,true);}finally{running.current=false;if(generation.current===turn)setBusy(false);}
 }
 if(status!=='confirmed'&&!receipt)return null;
 return <section className="guestCancellation" data-testid="guest-cancellation" aria-label={t('Cancel booking')} aria-busy={busy}>
  <h3>{t(receipt?'Booking cancelled':'Cancel booking')}</h3>
  {!online&&<p role="status">{t('Offline. Reconnect and retry manually. No cancellation is sent automatically.')}</p>}
  {error&&<p role="alert" className="guestEmailError">{t(error)}</p>}
  {receipt?<div data-testid="guest-cancellation-result" role="status">
   <p>{t('The booking is cancelled and its dates have been released.')}</p>
   <dl><dt>{t('Cancellation charge')}</dt><dd>{money(receipt.penaltyMinor,receipt.currency)}</dd><dt>{t('Refund amount')}</dt><dd>{money(receipt.refundMinor,receipt.currency)}</dd></dl>
   <p>{t(receipt.refundStatus==='pending'?'The refund is pending processing. This is not confirmation that money has reached your account.':'No refund is required for this cancellation.')}</p>
  </div>:<>
   <p>{t('Review the calculation before confirming. Opening it does not cancel your booking.')}</p>
   {!attempt&&!unavailable&&<button data-testid="guest-cancellation-preview-button" disabled={busy||!online} onClick={()=>void preview()}>{t(quote?'Recalculate cancellation':'Calculate cancellation')}</button>}
   {quote&&<div data-testid="guest-cancellation-preview">
    <p>{t('The cancellation conditions saved with this booking apply.')}</p>
    <dl><dt>{t('Booking total')}</dt><dd>{money(quote.totalMinor,quote.currency)}</dd><dt>{t('Collected after previous refunds')}</dt><dd>{money(quote.netCollectedMinor,quote.currency)}</dd>
     <dt>{t('Cancellation charge')}</dt><dd>{money(quote.penaltyMinor,quote.currency)}</dd><dt>{t('Refund amount')}</dt><dd>{money(quote.refundMinor,quote.currency)}</dd>
     <dt>{t('Refund rate for eligible charges')}</dt><dd>{new Intl.NumberFormat(localeTags[locale],{style:'percent',maximumFractionDigits:2}).format(quote.refundBps/10000)}</dd>
     <dt>{t('Check-in')}</dt><dd>{date(quote.checkInAt,quote.policyTimezone)}</dd><dt>{t('Calculation valid until')}</dt><dd>{date(quote.expiresAt,quote.policyTimezone)}</dd>
     <dt>{t('Property time zone')}</dt><dd>{quote.policyTimezone}</dd></dl>
    <p>{t('Confirming releases the booking dates. A refund, if due, is processed separately and is not an immediate bank transfer.')}</p>
    {expired&&!attempt&&<p role="status">{t('This calculation expired. Recalculate before confirming.')}</p>}
    <button className="primary" data-testid="guest-cancellation-confirm" disabled={busy||!online||(expired&&!attempt)} onClick={()=>void confirm()}>{t(attempt?'Retry the same cancellation request':'Confirm cancellation')}</button>
   </div>}
  </>}
 </section>;
}
