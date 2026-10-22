import {useEffect,useState} from 'react';
import {ClipboardCheck} from 'lucide-react';
import {useGuestLocale} from './GuestLocale';
import {validGuestServiceDraft} from './guest-experience';
export function GuestServicePreview({service}:{service:string}){
 const {t}=useGuestLocale(),[details,setDetails]=useState(''),[date,setDate]=useState(''),[time,setTime]=useState(''),[preview,setPreview]=useState(false);
 useEffect(()=>setPreview(false),[service]);
 const valid=validGuestServiceDraft({details,date,time});
 return <section className="guestServiceComposer"><div className="guestServiceIntro"><small>{t('SERVICE REQUEST')}</small><h3>{t(service)}</h3><p>{t('Quick help, right where you stay.')}</p></div>
  <p className="notice">{t('Preview the request here. Sending and linking to an active booking require a connected guest account.')}</p>
  <form data-testid="guest-service-preview-form" onSubmit={event=>{event.preventDefault();if(valid)setPreview(true);}}>
   <label>{t('Details')}<textarea required minLength={2} maxLength={1000} value={details} onChange={event=>{setDetails(event.target.value);setPreview(false);}} placeholder={t('Tell us what you need…')}/></label>
   <div className="two"><label>{t('Preferred date')}<input type="date" value={date} onChange={event=>{setDate(event.target.value);setPreview(false);}}/></label><label>{t('Preferred time')}<input type="time" value={time} onChange={event=>{setTime(event.target.value);setPreview(false);}}/></label></div>
   <button className="primary" disabled={!valid} type="submit">{t('Preview request')}</button>
  </form>
  {preview&&<div className="guestServiceReceipt" data-testid="guest-service-preview" role="status"><ClipboardCheck aria-hidden="true"/><div><h4>{t('Request preview — not sent')}</h4><b>{t(service)}</b><p>{details.trim()}</p>{(date||time)&&<p>{date} {time}</p>}<small>{t('This draft stays on this screen only. No service order or message has been created.')}</small></div></div>}
 </section>;
}
