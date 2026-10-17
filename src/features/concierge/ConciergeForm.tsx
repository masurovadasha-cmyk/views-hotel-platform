import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {majorToMinor} from '../local-core/folio-workspace-api';
import {conciergeText} from './locale';
export function ConciergeForm({locale,disabled,onSubmit}:{locale:Locale;disabled:boolean;onSubmit:(fields:Record<string,unknown>)=>void}){
 const t=(k:string)=>conciergeText(locale,k),[category,setCategory]=useState('restaurant'),[partySize,setPartySize]=useState(2),[when,setWhen]=useState(''),[budget,setBudget]=useState(''),[message,setMessage]=useState(''),[consent,setConsent]=useState(false);
 let minor:string|null=null;try{minor=!budget.trim()||/^0([.,]00?)?$/.test(budget)?'0':majorToMinor(budget);}catch{/* Invalid budget stays unsent. */}
 const valid=minor!==null&&Number.isInteger(partySize)&&partySize>=1&&partySize<=50&&Number.isFinite(Date.parse(when))&&Date.parse(when)>Date.now()&&message.trim()&&consent;
 return <form onSubmit={e=>{e.preventDefault();if(valid)onSubmit({category,partySize,budgetMinor:minor,requestedFor:new Date(when).toISOString(),message:message.trim()});}}><fieldset disabled={disabled} onChange={()=>setConsent(false)}><legend>{t('details')}</legend>
 <label>{t('category')}<select aria-label={t('category')} value={category} onChange={e=>setCategory(e.target.value)}>{['restaurant','documents','help'].map(k=><option key={k} value={k}>{t(k)}</option>)}</select></label>
 <label>{t('partySize')}<input type="number" min={1} max={50} required value={partySize} onChange={e=>setPartySize(e.target.valueAsNumber)}/></label>
 <label>{t('when')}<input type="datetime-local" required value={when} onChange={e=>setWhen(e.target.value)}/></label>
 <label>{t('budget')}<input inputMode="decimal" maxLength={20} value={budget} onChange={e=>setBudget(e.target.value)}/></label>
 <label>{t('message')}<input maxLength={500} required value={message} onChange={e=>setMessage(e.target.value)}/></label><p>{t('privacy')}</p>
 </fieldset><fieldset disabled={disabled}><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('consent')}</label><button disabled={!valid}>{t('confirm')}</button></fieldset></form>;
}
