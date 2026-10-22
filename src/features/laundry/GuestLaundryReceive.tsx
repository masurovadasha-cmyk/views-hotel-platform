import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import type {Attempt} from '../service-orders/model';
import type {LaundryIntake} from './model';
import {laundryText} from './locale';
import {laundryReceiptAttempt} from './guest-laundry-receipt';
export function GuestLaundryReceive({order,locale,disabled,act}:{order:Pick<LaundryIntake,'intakeId'|'stage'|'revision'|'currency'|'claim'>&{totalMinor:string};locale:Locale;disabled:boolean;act:(a:Attempt)=>Promise<void>}){
 const [consent,setConsent]=useState(false),t=(key:string)=>laundryText(locale,key);
 const eligible=order.stage==='delivered'&&(!order.claim||order.claim.status==='resolved');
 if(!eligible)return null;
 async function submit(){
  if(disabled||!consent||!eligible)return;
  await act(laundryReceiptAttempt(order.intakeId,order.revision,order.totalMinor,order.currency,crypto.randomUUID()));
 }
 return <form onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={disabled}>
  <legend>{t('receipt')}</legend><p>{t('receiptTerms')}</p>
  <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('receiptConsent')}</label>
  <button type="submit" disabled={!consent}>{t('receipt')}</button>
 </fieldset></form>;
}
