import {GuestReservationLink} from './GuestReservationLink';
import {GuestTrips} from './GuestTrips';
import {expireMatchingGuestSession} from './guest-session-guard';
import {createGuestOperationGuard} from './guest-operation-guard';
import {useCallback,useEffect,useRef,useState} from 'react';
import {guestEmail,GuestEmailError,type GuestSession} from '../../api/guest-email';
import {translate,type MessageValues} from '../../i18n/messages';
import {useGuestLocale} from '../guest/GuestLocale';
import {consumeGuestEmailLink,type GuestEmailLinkState} from './guest-email-link';
import catalog from './guest-email-translations.json';
import './guest-email.css';
const UNKNOWN='The server did not confirm the operation. Check your session before retrying; no request is retried automatically.';
const INVALID='This link is invalid, expired or already used. Request a new one.';
function message(error:unknown){
 const code=error instanceof GuestEmailError?error.code:'';
 if(['GUEST_EMAIL_LINK_INVALID','GUEST_EMAIL_CHALLENGE_INACTIVE'].includes(code))return INVALID;
 if(['RATE_LIMITED','EMAIL_RESEND_COOLDOWN'].includes(code))return 'Too many requests. Wait before trying again.';
 if(['GUEST_EMAIL_DISABLED','GUEST_EMAIL_NOT_CONNECTED','GUEST_EMAIL_KEY_REQUIRED'].includes(code))return 'Email sign-in is not connected on this server.';
 if(code==='GUEST_EMAIL_DELIVERY_UNCERTAIN')return 'Delivery could not be confirmed. No automatic resend will occur. Wait before requesting a new link.';
 if(code==='GUEST_SIGN_OUT_FIRST')return 'Sign out before using a link for another account.';
 return UNKNOWN;
}
export function GuestEmailEntry({initialLink}:{initialLink:GuestEmailLinkState}){
 const {locale}=useGuestLocale(),t=(s:string,v?:MessageValues)=>translate(catalog,locale,s,v);
 const [link,setLink]=useState(initialLink.link),[email,setEmail]=useState('');
 const [session,setSession]=useState<GuestSession|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(initialLink.invalid?INVALID:''),[notice,setNotice]=useState('');
 const [deadline,setDeadline]=useState(0),[clock,setClock]=useState(Date.now()),[online,setOnline]=useState(navigator.onLine);
 const [tripRevision,setTripRevision]=useState(0);
 const operations=useRef(createGuestOperationGuard()).current,[guardVersion,setGuardVersion]=useState(0);
 const sessionKey=session?.authenticated?session.profile.userId+':'+session.csrf:'';
 const owner=sessionKey+':'+tripRevision;operations.enter(owner);
 const tripPending=useCallback((value:boolean)=>{if(operations.report(owner,'trip',value))setGuardVersion(v=>v+1);},[operations,owner]);
 const linkBusy=useCallback((value:boolean)=>{if(operations.report(owner,'link',value))setGuardVersion(v=>v+1);},[operations,owner]);
 const linked=useCallback(()=>{if(operations.requestRefresh(owner))setGuardVersion(v=>v+1);},[operations,owner]);
 useEffect(()=>{if(operations.takeRefresh())setTripRevision(v=>v+1);},[guardVersion,operations]);
 const running=useRef(false),generation=useRef(0),currentSession=useRef(session);currentSession.current=session;
 function applySession(next:GuestSession|null){currentSession.current=next;setSession(next);}
 const seconds=Math.max(0,Math.ceil((deadline-clock)/1000));
 useEffect(()=>{if(!deadline)return;const id=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(id);},[deadline]);
 useEffect(()=>{
  const connection=()=>setOnline(navigator.onLine);
  const receive=()=>{const next=consumeGuestEmailLink(location.href,url=>history.replaceState(null,'',url));if(!next.link&&!next.invalid)return;
   setLink(next.link);setError(next.invalid?INVALID:'');setNotice('');};
  window.addEventListener('online',connection);window.addEventListener('offline',connection);window.addEventListener('hashchange',receive);
  return()=>{window.removeEventListener('online',connection);window.removeEventListener('offline',connection);window.removeEventListener('hashchange',receive);};
 },[]);
 useEffect(()=>{
  const current=++generation.current;setLoading(true);
  void guestEmail.session().then(s=>{if(generation.current===current)applySession(s);}).catch(e=>{if(generation.current===current)setError(message(e));})
   .finally(()=>{if(generation.current===current)setLoading(false);});
  return()=>{generation.current++;};
 },[]);
 async function act(kind:'request'|'exchange'|'logout'|'refresh'){
  if(running.current||!online||operations.blocked())return;running.current=true;setBusy(true);setError('');setNotice('');const current=generation.current;
  try{
   if(kind==='request'){
    setDeadline(Date.now()+60000);setClock(Date.now());
    await guestEmail.request(email.trim(),locale);
    if(current===generation.current)setNotice('Link accepted by test delivery. Open the captured message to continue.');
   }else if(kind==='exchange'&&link){
    await guestEmail.exchange(link);
    if(current===generation.current)setLink(previous=>previous===link?null:previous);
    const next=await guestEmail.session();if(current===generation.current)applySession(next);
   }else if(kind==='logout'&&session?.authenticated){
    await guestEmail.logout(session.csrf);
    if(current===generation.current){applySession({authenticated:false});setNotice('Signed out on this browser.');}
   }else if(kind==='refresh'){
    const next=await guestEmail.session();if(current===generation.current)applySession(next);
   }
  }catch(e){if(current===generation.current){setError(message(e));if(e instanceof GuestEmailError&&e.retryAfterSeconds>0){setDeadline(Date.now()+e.retryAfterSeconds*1000);setClock(Date.now());}}}
  finally{if(current===generation.current){running.current=false;setBusy(false);}}
 }
 const disabled=busy||loading||!online||operations.blocked();
 const expireSession=()=>{
  if(!session?.authenticated)return;
  const next=expireMatchingGuestSession(currentSession.current,session);if(next===currentSession.current)return;
  generation.current++;running.current=false;setBusy(false);setLoading(false);applySession(next);
 };
 return <main className="guestEmail" aria-busy={busy||loading}>
  <div className="guestEmailIntro"><span className="guestEmailEyebrow">VIEWS · {t('Guest account')}</span><h1>{t(session?.authenticated?'Signed in as guest':link?'Confirm sign-in':'Continue with email')}</h1>
   <p>{t(session?.authenticated?'Your guest session is saved on this browser.':'We will send a single-use link. It expires in 15 minutes.')}</p>
   <aside><strong>{t('Local email sign-in test')}</strong><p>{t('This test uses captured email. Real email delivery and payments are not connected.')}</p></aside></div>
  <section className="guestEmailCard" aria-label={t('Guest account')}>
   {!online&&<p role="status">{t('You are offline. Restore the connection and retry manually.')}</p>}
   {error&&<p className="guestEmailError" role="alert">{t(error)}</p>}
   {notice&&<p role="status">{t(notice)}</p>}
   {operations.tripPending()&&<p role="status">{t('Resolve the pending operation before signing out, checking your session or linking a booking.')}</p>}
   {loading?<p role="status">{t('Checking session…')}</p>:session?.authenticated?<>
    <p className="guestEmailAddress" data-testid="guest-identity">{session.profile.email}</p>
    <p>{t('Your guest session is active. Employee workspaces require separate access.')}</p>
    {link&&<p>{t('Sign out before using a link for another account.')}</p>}
    <button className="primary" disabled={disabled} onClick={()=>void act('logout')}>{t(busy?'Please wait…':'Sign out')}</button>
   </>:session&&link?<>
    <p>{t('The link was removed from the address bar. Opening this page does not sign you in. Confirm only if you requested this link.')}</p>
    <button className="primary" disabled={disabled} onClick={()=>void act('exchange')}>{t(busy?'Please wait…':'Confirm sign-in')}</button>
    <button disabled={disabled} onClick={()=>{setLink(null);setError('');}}>{t('Request a new link')}</button>
   </>:session?<form onSubmit={e=>{e.preventDefault();void act('request');}}>
    <label htmlFor="guest-email">{t('Email address')}</label>
    <input id="guest-email" type="email" required maxLength={254} autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} disabled={disabled} onChange={e=>setEmail(e.target.value)}/>
    <button className="primary" disabled={disabled||seconds>0}>{t(busy?'Please wait…':'Send sign-in link')}</button>
    {seconds>0&&<p>{t('You can request another link in {seconds} s.',{seconds})}</p>}
   </form>:null}
   {!loading&&<button disabled={disabled} onClick={()=>void act('refresh')}>{t('Check session again')}</button>}
  </section>
  {session?.authenticated&&<GuestTrips key={owner} csrf={session.csrf} online={online} externalBusy={busy||loading||operations.linkPending()} onPending={tripPending} onSessionExpired={expireSession}/>}
  {session?.authenticated&&<GuestReservationLink key={sessionKey} csrf={session.csrf} online={online} blocked={disabled} onBusy={linkBusy} onLinked={linked} onExpired={expireSession}/>}
 </main>;
}
