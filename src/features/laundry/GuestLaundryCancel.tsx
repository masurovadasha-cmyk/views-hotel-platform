import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import type {Attempt} from '../service-orders/model';
import type {LaundryIntake} from './model';
import {laundryText} from './locale';
import {laundryCancelAttempt} from './guest-laundry-cancel';
export function GuestLaundryCancel({order,locale,disabled,act}:{order:Pick<LaundryIntake,'intakeId'|'stage'|'revision'>;locale:Locale;disabled:boolean;act:(a:Attempt)=>Promise<void>}){
 const t=(key:string)=>laundryText(locale,key),[review,setReview]=useState(false),[confirmed,setConfirmed]=useState(false);
 if(order.stage!=='requested')return null;
 async function submit(){
  if(disabled||!review||!confirmed||order.stage!=='requested')return;
  await act(laundryCancelAttempt(order.intakeId,order.revision,crypto.randomUUID()));
 }
 return <div>{!review?<button disabled={disabled} onClick={()=>{setReview(true);setConfirmed(false);}}>{t('cancel')}</button>:
  <form onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={disabled}>
   <legend>{t('cancelReview')}</legend><p>{t('cancelTerms')}</p>
   <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('cancelConsent')}</label>
   <button type="submit" disabled={!confirmed}>{t('confirmCancel')}</button>
   <button type="button" onClick={()=>{setReview(false);setConfirmed(false);}}>{t('keepPickup')}</button>
  </fieldset></form>}
 </div>;
}
