import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import type {Attempt} from '../service-orders/model';
import type {LaundryIntake} from './model';
import {laundryText} from './locale';
import {laundryAcceptAttempt} from './guest-laundry-accept';
export function GuestLaundryApprove({order,locale,disabled,act}:{order:Pick<LaundryIntake,'intakeId'|'stage'|'revision'>&{totalMinor:string};locale:Locale;disabled:boolean;act:(a:Attempt)=>Promise<void>}){
 const [consent,setConsent]=useState(false),t=(key:string)=>laundryText(locale,key);
 if(order.stage!=='quoted')return null;
 async function submit(){
  if(disabled||!consent||order.stage!=='quoted')return;
  await act(laundryAcceptAttempt(order.intakeId,order.revision,order.totalMinor,crypto.randomUUID()));
 }
 return <form onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={disabled}>
  <legend>{t('approve')}</legend><p>{t('approvalTerms')}</p>
  <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('approveConsent')}</label>
  <button type="submit" disabled={!consent}>{t('approve')}</button>
 </fieldset></form>;
}
