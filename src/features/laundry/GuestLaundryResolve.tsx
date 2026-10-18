import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import type {Attempt} from '../service-orders/model';
import type {LaundryIntake,LaundryClaimState} from './model';
import {claimText} from './claim-locale';
import {laundryResolveAttempt} from './guest-laundry-resolve';
import './claims.css';
export function GuestLaundryResolve({order,locale,disabled,act}:{order:Pick<LaundryIntake,'intakeId'|'stage'|'revision'|'currency'>&{totalMinor:string;claim:LaundryClaimState};locale:Locale;disabled:boolean;act:(a:Attempt)=>Promise<void>}){
 const [consent,setConsent]=useState(false),t=(k:string)=>claimText(locale,k),eligible=['open','answered'].includes(order.claim.status);
 if(!eligible)return null;
 async function submit(){if(disabled||!consent||!eligible)return;await act(laundryResolveAttempt(order.intakeId,order.revision,order.stage,order.totalMinor,order.currency,order.claim,crypto.randomUUID()));}
 return <form className="laundryClaim" onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={disabled}>
  <legend>{t('resolve')}</legend><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('consent')}</label>
  <button type="submit" disabled={!consent}>{t('resolve')}</button>
 </fieldset></form>;
}
