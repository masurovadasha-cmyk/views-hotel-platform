import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {localizedName} from '../local-core/staff-locale';
import type {MarketOrder} from './model';
import {marketText} from './locale';
export function MarketQuantityProposal({order,locale,onAction}:{order:MarketOrder;locale:Locale;onAction:(action:string,fields:Record<string,unknown>)=>void}){
 const [from,setFrom]=useState(''),[quantity,setQuantity]=useState(1),[note,setNote]=useState(''),t=(k:string)=>marketText(locale,k);
 const lines=order.lines.filter(l=>l.quantity>1),selected=lines.find(l=>l.serviceId===from);
 if(!lines.length)return null;
 return <fieldset data-testid="quantity-proposal"><legend>{t('quantityProposal')}</legend><p>{t('quantityTerms')}</p>
  <label>{t('reduceProduct')}<select aria-label={t('reduceProduct')} value={from} onChange={e=>{setFrom(e.target.value);setQuantity(1);}}><option value="">—</option>{lines.map(l=><option key={l.serviceId} value={l.serviceId}>{localizedName(l.name,locale)} × {l.quantity}</option>)}</select></label>
  <label>{t('reducedQuantity')}<input type="number" min={1} max={selected?selected.quantity-1:1} value={quantity} onChange={e=>setQuantity(e.target.valueAsNumber)}/></label>
  <label>{t('reductionReason')}<textarea maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
  <button disabled={!selected||!Number.isInteger(quantity)||quantity<1||quantity>=selected.quantity||note.trim().length<3} onClick={()=>onAction('propose_quantity',{fromServiceId:from,quantity,note:note.trim()})}>{t('sendQuantity')}</button>
 </fieldset>;
}
