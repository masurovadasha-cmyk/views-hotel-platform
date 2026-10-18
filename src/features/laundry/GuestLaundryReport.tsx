import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import type {Attempt} from '../service-orders/model';
import type {LaundryIntake,LaundryItem} from './model';
import {claimText} from './claim-locale';
import {canReportLaundry,laundryClaimAttempt} from './guest-laundry-claim';
import './claims.css';
export function GuestLaundryReport({order,locale,disabled,act}:{order:Pick<LaundryIntake,'intakeId'|'stage'|'revision'|'currency'|'claim'>&{totalMinor:string;items:LaundryItem[]};locale:Locale;disabled:boolean;act:(a:Attempt)=>Promise<void>}){
 const [tag,setTag]=useState(order.items[0]?.tag??''),[kind,setKind]=useState('quality'),[note,setNote]=useState(''),t=(key:string)=>claimText(locale,key);
 const eligible=canReportLaundry(order.stage,order.claim),valid=order.items.some(i=>i.tag===tag)&&['quality','missing','damaged'].includes(kind)&&note.trim().length>=3&&note.trim().length<=500&&!/[\u0000-\u001f\u007f]/.test(note);
 if(!eligible)return null;
 async function submit(){if(disabled||!eligible||!valid)return;await act(laundryClaimAttempt(order.intakeId,order.revision,order.stage,order.totalMinor,order.currency,{tag,kind,note},crypto.randomUUID()));}
 return <form className="laundryClaim" onSubmit={e=>{e.preventDefault();void submit();}}><fieldset disabled={disabled}>
  <legend>{t('title')}</legend><p>{t('hint')}</p>{order.stage==='closed'&&<p>{t('alreadyCharged')}</p>}
  <label>{t('tag')}<select aria-label={t('tag')} value={tag} onChange={e=>setTag(e.target.value)}>{order.items.map(i=><option key={i.tag} value={i.tag}>{i.tag} · {i.description}</option>)}</select></label>
  <label>{t('kind')}<select aria-label={t('kind')} value={kind} onChange={e=>setKind(e.target.value)}>{['quality','missing','damaged'].map(k=><option key={k} value={k}>{t(k)}</option>)}</select></label>
  <label>{t('note')}<input required minLength={3} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
  <button type="submit" disabled={!valid}>{t('report')}</button>
 </fieldset></form>;
}
