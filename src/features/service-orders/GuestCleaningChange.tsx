import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {cleaningText} from './locale';
import type {Attempt,CleaningOrder} from './model';

/** Review before sending; the server rechecks ownership, revision and stage. */
export function GuestCleaningChange({order,locale,disabled,act}:{order:CleaningOrder;locale:Locale;disabled:boolean;act:(a:Attempt)=>Promise<void>}){
 const t=(key:string)=>cleaningText(locale,key);
 const [mode,setMode]=useState<'cancel'|'reschedule'|null>(null),[time,setTime]=useState(''),[confirmed,setConfirmed]=useState(false);
 if(!['requested','assigned'].includes(order.stage))return null;
 function choose(next:'cancel'|'reschedule'){setMode(next);setTime('');setConfirmed(false);}
 async function submit(){
  if(!mode||!confirmed||disabled)return;
  const body:Record<string,unknown>={action:mode,expectedRevision:order.revision};
  if(mode==='reschedule'){if(!Number.isFinite(Date.parse(time)))return;body.requestedFor=new Date(time).toISOString();}
  await act({route:`services/orders/${order.orderId}/actions`,key:crypto.randomUUID(),body});
  setMode(null);setConfirmed(false);
 }
 return <div data-testid="guest-cleaning-change">
  {!mode?<><button disabled={disabled} onClick={()=>choose('reschedule')}>{t('changeTime')}</button><button disabled={disabled} onClick={()=>choose('cancel')}>{t('cancel')}</button></>:
   <form onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={disabled}>
    <legend>{t(mode==='cancel'?'cancelReview':'rescheduleReview')}</legend>
    <p>{t(mode==='cancel'?'cancelTerms':'rescheduleTerms')}</p>
    {mode==='reschedule'&&<label>{t('time')}<input type="datetime-local" required value={time} onChange={e=>{setTime(e.target.value);setConfirmed(false);}}/></label>}
    <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('changeConsent')}</label>
    <button type="submit" disabled={!confirmed}>{t('confirmChange')}</button>
    <button type="button" onClick={()=>setMode(null)}>{t('keepOrder')}</button>
   </fieldset></form>}
 </div>;
}
