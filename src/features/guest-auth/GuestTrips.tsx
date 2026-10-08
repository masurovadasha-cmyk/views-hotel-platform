import {useEffect,useRef,useState} from 'react';
import {guestTrips,type GuestTrip,type GuestTripPage} from '../../api/guest-trips';
import {GuestEmailError} from '../../api/guest-email';
import {useGuestLocale} from '../guest/GuestLocale';
import {translate} from '../../i18n/messages';
import catalog from './guest-trips-translations.json';
import {formatStaffMoney,localeTags,localizedName} from '../local-core/staff-locale';
export function GuestTrips({online,onSessionExpired}:{online:boolean;onSessionExpired:()=>void}){
 const {locale}=useGuestLocale(),t=(s:string)=>translate(catalog,locale,s);
 const [page,setPage]=useState<GuestTripPage|null>(null),[selected,setSelected]=useState<GuestTrip|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState('');
 const generation=useRef(0),busy=useRef(false),expired=useRef(onSessionExpired);expired.current=onSessionExpired;
 function failure(e:unknown){
  setPage(null);setSelected(null);
  if(e instanceof GuestEmailError&&e.code==='GUEST_EMAIL_SESSION_INVALID'){expired.current();return;}
  setError(e instanceof GuestEmailError&&e.code==='GUEST_TRIPS_DISABLED'?'Trips are not connected on this server.':
   e instanceof GuestEmailError&&e.code==='GUEST_TRIP_NOT_FOUND'?'This trip is no longer available to your account.':'Could not load trips. Try again.');
 }
 async function load(cursor?:string,id?:string){
  if(busy.current||!online)return;busy.current=true;const turn=++generation.current;setLoading(true);setError('');setSelected(null);
  // Clear the previous page before a new authorization check. No persistent trip cache.
  if(!id)setPage(null);
  try{
   if(id){const trip=await guestTrips.detail(id);if(generation.current===turn)setSelected(trip);}
   else{const next=await guestTrips.list(cursor);if(generation.current===turn)setPage(next);}
  }catch(e){if(generation.current===turn)failure(e);}
  finally{if(generation.current===turn){busy.current=false;setLoading(false);}}
 }
 useEffect(()=>{void load();return()=>{generation.current++;busy.current=false;};},[]);
 function when(value:string,zone:string){try{return new Intl.DateTimeFormat(localeTags[locale],{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(new Date(value));}catch{return value;}}
 function money(trip:GuestTrip){return ['UZS','USD','EUR'].includes(trip.currency)?formatStaffMoney(trip.totalMinor,locale).replace(/UZS$/,trip.currency):trip.totalMinor+' '+trip.currency+' '+t('(minor units)');}
 function summary(trip:GuestTrip){return <>
  <h3>{localizedName(trip.property.name,locale)}</h3><p>{trip.property.city}</p>
  <p>{t('Status')}: {t(trip.status)}</p>
  <dl><dt>{t('Check-in')}</dt><dd>{when(trip.checkInAt,trip.property.timezone)}</dd>
   <dt>{t('Check-out')}</dt><dd>{when(trip.checkOutAt,trip.property.timezone)}</dd>
   <dt>{t('Property time zone')}</dt><dd>{trip.property.timezone}</dd>
   <dt>{t('Booking total')}</dt><dd>{money(trip)}</dd></dl>
 </>;}
 return <section className="guestTrips" aria-label={t('My trips')} aria-busy={loading}>
  <h2>{t('My trips')}</h2><p>{t('Only bookings linked to your account appear here. A matching email address alone does not grant access.')}</p>
  {!online&&<p role="status">{t('Offline. Reconnect to refresh your trips.')}</p>}
  {loading&&<p role="status">{t('Loading trips…')}</p>}{error&&<p role="alert">{t(error)}</p>}
  {!loading&&selected?<article data-testid="guest-trip-detail">{summary(selected)}<p>{t('Confirmation code')}: {selected.confirmationCode}</p>
   <p>{t('Viewing only. Changes, cancellation and payment are not connected here yet.')}</p>
   <button disabled={!online} onClick={()=>void load()}>{t('Back to trips')}</button></article>:!loading&&page&&<>
   {!page.items.length&&<p>{t('No bookings are linked to this account yet.')}</p>}
   <div className="guestTripsGrid">{page.items.map(trip=><article key={trip.id} data-testid="guest-trip">{summary(trip)}
    <button disabled={!online} onClick={()=>void load(undefined,trip.id)}>{t('View trip')}</button></article>)}</div>
   {page.nextCursor&&<button disabled={!online} onClick={()=>void load(page.nextCursor!)}>{t('Next trips')}</button>}
  </>}
  <button disabled={loading||!online} onClick={()=>void load()}>{t(error?'Try again':'Refresh trips')}</button>
 </section>;
}
