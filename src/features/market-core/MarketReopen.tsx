import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {marketText} from './locale';
export function MarketReopen({locale,onAction}:{locale:Locale;onAction:(action:string,fields:Record<string,unknown>)=>void}){
 const [confirmed,setConfirmed]=useState(false),[note,setNote]=useState(''),t=(k:string)=>marketText(locale,k);
 return <fieldset data-testid="market-reopen"><legend>{t('reopen')}</legend><p>{t('reopenTerms')}</p>
  <label>{t('reopenNote')}<textarea maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
  <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>{t('reopenConfirm')}</label>
  <button disabled={!confirmed||note.trim().length<3} onClick={()=>onAction('reopen_picking',{returnedToStorage:true,note:note.trim()})}>{t('reopen')}</button>
 </fieldset>;
}
