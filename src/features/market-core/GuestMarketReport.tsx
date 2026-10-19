import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import type {Attempt} from '../service-orders/model';
import type {MarketOrder} from './model';
import {marketText} from './locale';
import {canReportMarket,marketIssueAttempt} from './guest-market-issue';
export function GuestMarketReport({order,locale,disabled,act}:{order:Pick<MarketOrder,'orderId'|'stage'|'revision'|'totalMinor'|'currency'|'issue'>;locale:Locale;disabled:boolean;act:(a:Attempt)=>Promise<void>}){
 const [note,setNote]=useState(''),t=(key:string)=>marketText(locale,key),eligible=canReportMarket(order.stage,order.issue);
 const valid=note.trim().length>=3&&note.trim().length<=1000&&!/[\u0000-\u001f\u007f]/.test(note);
 if(!eligible)return null;
 async function submit(){if(disabled||!eligible||!valid)return;await act(marketIssueAttempt(order.orderId,order.revision,order.stage,order.totalMinor,order.currency,note,crypto.randomUUID()));}
 return <form onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={disabled}>
 <legend>{t('issue')}</legend><p>{t('noRefund')}</p>
 <label>{t('issueNote')}<input required minLength={3} maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <button type="submit" disabled={!valid}>{t('reportIssue')}</button>
 </fieldset></form>;
}
