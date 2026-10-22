import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import type {Attempt} from '../service-orders/model';
import type {LaundryIntake} from './model';
import {laundryText} from './locale';
import {laundryRejectAttempt} from './guest-laundry-reject';
export function GuestLaundryReject({order,locale,disabled,act}:{order:Pick<LaundryIntake,'intakeId'|'stage'|'revision'>;locale:Locale;disabled:boolean;act:(a:Attempt)=>Promise<void>}){
 const t=(key:string)=>laundryText(locale,key),[review,setReview]=useState(false),[confirmed,setConfirmed]=useState(false);
 if(order.stage!=='quoted')return null;
 async function submit(){
  if(disabled||!review||!confirmed||order.stage!=='quoted')return;
  await act(laundryRejectAttempt(order.intakeId,order.revision,crypto.randomUUID()));
 }
 return <div>{!review?<button disabled={disabled} onClick={()=>{setReview(true);setConfirmed(false);}}>{t('decline')}</button>:
  <form onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={disabled}>
   <legend>{t('rejectReview')}</legend><p>{t('rejectTerms')}</p>
   <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('rejectConsent')}</label>
   <button type="submit" disabled={!confirmed}>{t('confirmReject')}</button>
   <button type="button" onClick={()=>{setReview(false);setConfirmed(false);}}>{t('keepQuote')}</button>
  </fieldset></form>}
 </div>;
}
