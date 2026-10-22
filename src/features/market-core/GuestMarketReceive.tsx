import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import type {Attempt} from '../service-orders/model';
import type {MarketOrder} from './model';
import {marketText} from './locale';
import {marketReceiptAttempt} from './guest-market-receipt';
export function GuestMarketReceive({order,locale,disabled,act}:{order:Pick<MarketOrder,'orderId'|'stage'|'revision'|'currency'|'issue'>&{totalMinor:string};locale:Locale;disabled:boolean;act:(a:Attempt)=>Promise<void>}){
 const [consent,setConsent]=useState(false),t=(key:string)=>marketText(locale,key);
 const eligible=order.stage==='handed_over'&&order.issue?.status!=='open';
 if(!eligible)return null;
 async function submit(){
  if(disabled||!consent||!eligible)return;
  await act(marketReceiptAttempt(order.orderId,order.revision,order.totalMinor,order.currency,crypto.randomUUID()));
 }
 return <form onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={disabled}>
  <legend>{t('receipt')}</legend><p>{t('terms')}</p>
  <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('receiptConsent')}</label>
  <button type="submit" disabled={!consent}>{t('receipt')}</button>
 </fieldset></form>;
}
