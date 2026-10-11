import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import type {Attempt} from '../service-orders/model';
import type {LaundryIntake} from './model';
import {laundryText} from './locale';
export function GuestLaundryActions({intake:o,locale,canRequest,disabled,act}:{intake:LaundryIntake;locale:Locale;canRequest:boolean;disabled:boolean;act:(a:Attempt)=>Promise<void>}){
 const [consent,setConsent]=useState(false),t=(k:string)=>laundryText(locale,k);
 const send=(action:string)=>void act({route:`services/laundry/${o.intakeId}/actions`,key:crypto.randomUUID(),body:{action,expectedRevision:o.revision,...(action==='accept'?{expectedTotalMinor:o.totalMinor}:{})}});
 return <fieldset disabled={disabled}>
 {o.stage==='requested'&&<button onClick={()=>send('cancel')}>{t('cancel')}</button>}
 {o.stage==='quoted'&&<>{canRequest&&<><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('approveConsent')}</label><button disabled={!consent} onClick={()=>send('accept')}>{t('approve')}</button></>}<button onClick={()=>send('reject')}>{t('decline')}</button></>}
 {o.stage==='delivered'&&<><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('receiptConsent')}</label><button disabled={!consent} onClick={()=>send('confirm_receipt')}>{t('receipt')}</button></>}
 </fieldset>;
}
