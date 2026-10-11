import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {formatStaffMoney,localizedName,localeTags} from '../local-core/staff-locale';
import {marketText} from './locale';
import type {MarketOrder} from './model';
export function marketMoney(minor:string,currency:string,locale:Locale){return formatStaffMoney(minor,locale).replace(/UZS$/,currency);}
export function MarketOrderCard({order:o,locale,staff=false,disabled,onAction,onReplace}:{order:MarketOrder;locale:Locale;staff?:boolean;disabled:boolean;onReplace?:()=>void;onAction:(action:string,fields?:Record<string,unknown>)=>void}){
 const t=(k:string)=>marketText(locale,k),[note,setNote]=useState(''),[consent,setConsent]=useState(false),[check,setCheck]=useState({quantities:false,expiry:false,packaging:false});
 return <article className="localPanel" data-market-order={o.orderId}><h4 data-testid="market-stage">{t(o.stage)}</h4><p>#{o.orderId.slice(0,8)}</p><time>{new Date(o.requestedFor).toLocaleString(localeTags[locale])}</time>
 {o.replacesOrderId&&<p>{t('replacesOrder')}: <code>{o.replacesOrderId.slice(0,8)}</code></p>}{o.replacedByOrderId&&<p>{t('replacedBy')}: <code>{o.replacedByOrderId.slice(0,8)}</code></p>}
 {o.unitCode&&<p>{t('unit')}: {o.unitCode}</p>}<ul>{o.lines.map(l=><li key={l.serviceId}>{localizedName(l.name,locale)} × {l.quantity} · {marketMoney((BigInt(l.priceMinor)*BigInt(l.quantity)).toString(),o.currency,locale)}</li>)}</ul>
 <p>{t('total')}: <strong>{marketMoney(o.totalMinor,o.currency,locale)}</strong></p><fieldset disabled={disabled}>
 {((!staff&&o.stage==='reserved')||(staff&&['reserved','picking','ready'].includes(o.stage)))&&<button onClick={()=>onAction('cancel')}>{t('cancel')}</button>}
 {!staff&&o.stage==='reserved'&&onReplace&&<button onClick={onReplace}>{t('editBasket')}</button>}
 {staff&&o.stage==='reserved'&&<button onClick={()=>onAction('pick')}>{t('pick')}</button>}
 {staff&&o.stage==='picking'&&<>{(['quantities','expiry','packaging'] as const).map(k=><label key={k}><input type="checkbox" checked={check[k]} onChange={e=>setCheck({...check,[k]:e.target.checked})}/>{t(k)}</label>)}<button disabled={!Object.values(check).every(Boolean)} onClick={()=>onAction('ready',{checklist:check})}>{t('readyAction')}</button></>}
 {staff&&o.stage==='ready'&&<><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('physical')}</label><button disabled={!consent} onClick={()=>onAction('handover')}>{t('handover')}</button></>}
 {!staff&&o.stage==='handed_over'&&o.issue?.status!=='open'&&<><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('receiptConsent')}</label><button disabled={!consent} onClick={()=>onAction('confirm_receipt')}>{t('receipt')}</button></>}
 {o.issue&&<section aria-label={t('issue')}><h5>{t(o.issue.status==='open'?'issueOpen':'issueAnswered')}</h5><p>{o.issue.note}</p>{o.issue.answer&&<p>{o.issue.answer}</p>}<p>{t('noRefund')}</p></section>}
 {((!staff&&['handed_over','completed'].includes(o.stage)&&o.issue?.status!=='open')||(staff&&o.issue?.status==='open'))&&<><label>{t(staff?'answerNote':'issueNote')}<textarea maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label><button disabled={note.trim().length<3} onClick={()=>onAction(staff?'answer_issue':'report_issue',{note:note.trim()})}>{t(staff?'answerIssue':'reportIssue')}</button></>}
 </fieldset></article>;
}
