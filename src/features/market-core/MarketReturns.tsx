import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {localizedName} from '../local-core/staff-locale';
import type {MarketOrder,MarketReturn} from './model';
import {marketText} from './locale';
type Action=(action:string,fields?:Record<string,unknown>)=>void;
function Inspect({r,locale,onAction}:{r:MarketReturn;locale:Locale;onAction:Action}){
 const t=(k:string)=>marketText(locale,k),[note,setNote]=useState(''),[checks,setChecks]=useState({sealed:false,expiry:false,quality:false});
 return <fieldset><label>{t('inspectionNote')}<textarea maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
 {(['sealed','expiry','quality'] as const).map(k=><label key={k}><input type="checkbox" checked={checks[k]} onChange={e=>setChecks({...checks,[k]:e.target.checked})}/>{t('return_'+k)}</label>)}
 <button disabled={note.trim().length<3||!Object.values(checks).every(Boolean)} onClick={()=>onAction('restock_return',{returnId:r.id,note:note.trim(),checklist:checks})}>{t('restock')}</button>
 <button disabled={note.trim().length<3} onClick={()=>onAction('discard_return',{returnId:r.id,note:note.trim()})}>{t('discard')}</button></fieldset>;
}
export function MarketReturns({order:o,locale,staff,onAction}:{order:MarketOrder;locale:Locale;staff:boolean;onAction:Action}){
 const t=(k:string)=>marketText(locale,k),[serviceId,setServiceId]=useState(''),[quantity,setQuantity]=useState(1),[note,setNote]=useState(''),[present,setPresent]=useState(false);
 const lines=o.lines.map(l=>({...l,remaining:l.quantity-(o.returnedByService?.find(r=>r.serviceId===l.serviceId)?.quantity||0)})).filter(l=>l.remaining>0),selected=lines.find(l=>l.serviceId===serviceId);
 return <section data-testid="market-returns">
 {!!o.returns?.length&&<><h5>{t('returns')}</h5><p>{t('returnsOnly')}</p><ul>{o.returns.map(r=><li key={r.id} data-return-id={r.id}>{localizedName(o.lines.find(l=>l.serviceId===r.serviceId)?.name||{},locale)} × {r.quantity} · {t('return_'+r.status)}<p>{r.reason}</p>{r.resolutionNote&&<p>{r.resolutionNote}</p>}{staff&&r.status==='quarantined'&&<Inspect r={r} locale={locale} onAction={onAction}/>}</li>)}</ul></>}
 {staff&&o.stage==='completed'&&lines.length>0&&(o.returns?.length||0)<20&&<fieldset><legend>{t('receiveReturn')}</legend><p>{t('quarantineTerms')}</p>
 <label>{t('returnProduct')}<select aria-label={t('returnProduct')} value={serviceId} onChange={e=>{setServiceId(e.target.value);setPresent(false);}}><option value="">—</option>{lines.map(l=><option key={l.serviceId} value={l.serviceId}>{localizedName(l.name,locale)} · {l.remaining}</option>)}</select></label>
 <label>{t('quantity')}<input type="number" min={1} max={selected?.remaining||1} value={quantity} onChange={e=>{setQuantity(e.target.valueAsNumber);setPresent(false);}}/></label>
 <label>{t('returnReason')}<textarea maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <label><input type="checkbox" checked={present} onChange={e=>setPresent(e.target.checked)}/>{t('returnPresent')}</label>
 <button disabled={!selected||!present||!Number.isInteger(quantity)||quantity<1||quantity>selected.remaining||note.trim().length<3} onClick={()=>onAction('receive_return',{serviceId,quantity,note:note.trim()})}>{t('recordReturn')}</button></fieldset>}
 </section>;
}
