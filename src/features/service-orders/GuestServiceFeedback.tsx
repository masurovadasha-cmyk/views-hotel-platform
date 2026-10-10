import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {cleaningText} from './locale';
import type {Attempt,CleaningOrder} from './model';
export function GuestServiceFeedback({order,locale,disabled,act}:{order:CleaningOrder;locale:Locale;disabled:boolean;act:(a:Attempt)=>Promise<void>}){
 const t=(key:string)=>cleaningText(locale,key),[rating,setRating]=useState(''),[comment,setComment]=useState('');
 if(order.stage!=='done')return null;
 if(order.feedback)return <div data-testid="service-feedback-saved"><p>{t('rating')}: {order.feedback.rating} / 5</p><p>{order.feedback.comment}</p></div>;
 return <form data-testid="service-feedback" onSubmit={e=>{e.preventDefault();if(!rating||disabled)return;void act({route:`services/orders/${order.orderId}/feedback`,key:crypto.randomUUID(),body:{rating:Number(rating),comment}});}}>
  <fieldset disabled={disabled}><legend>{t('howWasIt')}</legend><p>{t('feedbackTerms')}</p>
   <label>{t('rating')}<select aria-label={t('rating')} required value={rating} onChange={e=>setRating(e.target.value)}><option value="">—</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} / 5</option>)}</select></label>
   <label>{t('feedbackComment')}<input maxLength={500} value={comment} onChange={e=>setComment(e.target.value)}/></label>
   <button disabled={!rating}>{t('sendFeedback')}</button>
  </fieldset>
 </form>;
}
