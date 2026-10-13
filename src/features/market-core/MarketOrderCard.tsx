import {MarketLotHandover} from './MarketLotHandover';
import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {localizedName,localeTags} from '../local-core/staff-locale';
import {marketText} from './locale';
import type {MarketOrder,MarketProduct} from './model';
import {MarketReopenHistory} from './MarketReopenHistory';
import {MarketReopen} from './MarketReopen';
import {MarketReturns} from './MarketReturns';
import {MarketCreditSummary} from './MarketCreditSummary';
import {MarketProposal} from './MarketProposal';
import {marketMoney} from './format';
export {marketMoney} from './format';
export function MarketOrderCard({order:o,locale,staff=false,disabled,onAction,onReplace,products=[]}:{order:MarketOrder;locale:Locale;staff?:boolean;products?:MarketProduct[];disabled:boolean;onReplace?:()=>void;onAction:(action:string,fields?:Record<string,unknown>)=>void}){
 const t=(k:string)=>marketText(locale,k),[note,setNote]=useState(''),[consent,setConsent]=useState(false),[check,setCheck]=useState({quantities:false,expiry:false,packaging:false});
 return <article className="localPanel" data-market-order={o.orderId}><h4 data-testid="market-stage">{t(o.stage)}</h4><p>#{o.orderId.slice(0,8)}</p><time>{new Date(o.requestedFor).toLocaleString(localeTags[locale])}</time>
 {o.replacesOrderId&&<p>{t('replacesOrder')}: <code>{o.replacesOrderId.slice(0,8)}</code></p>}{o.replacedByOrderId&&<p>{t('replacedBy')}: <code>{o.replacedByOrderId.slice(0,8)}</code></p>}
 {o.unitCode&&<p>{t('unit')}: {o.unitCode}</p>}<ul>{o.lines.map(l=><li key={l.serviceId}>{localizedName(l.name,locale)} × {l.quantity} · {marketMoney((BigInt(l.priceMinor)*BigInt(l.quantity)).toString(),o.currency,locale)}</li>)}</ul>
 <p>{t('total')}: <strong>{marketMoney(o.totalMinor,o.currency,locale)}</strong></p><fieldset disabled={disabled}>
 {((!staff&&o.stage==='reserved')||(staff&&['reserved','picking','ready'].includes(o.stage)))&&<button onClick={()=>onAction('cancel')}>{t('cancel')}</button>}
 {!staff&&o.stage==='reserved'&&o.proposal?.status!=='pending'&&onReplace&&<button onClick={onReplace}>{t('editBasket')}</button>}
 {staff&&o.stage==='reserved'&&o.proposal?.status!=='pending'&&<button onClick={()=>onAction('pick')}>{t('pick')}</button>}
 {staff&&o.stage==='picking'&&<>{(['quantities','expiry','packaging'] as const).map(k=><label key={k}><input type="checkbox" checked={check[k]} onChange={e=>setCheck({...check,[k]:e.target.checked})}/>{t(k)}</label>)}<button disabled={!Object.values(check).every(Boolean)} onClick={()=>onAction('ready',{checklist:check})}>{t('readyAction')}</button></>}
 {staff&&o.stage==='ready'&&<MarketLotHandover order={o} locale={locale} onAction={onAction}/>}
 {!staff&&o.stage==='handed_over'&&o.issue?.status!=='open'&&<><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('receiptConsent')}</label><button disabled={!consent} onClick={()=>onAction('confirm_receipt')}>{t('receipt')}</button></>}
 {o.issue&&<section aria-label={t('issue')}><h5>{t(o.issue.status==='open'?'issueOpen':'issueAnswered')}</h5><p>{o.issue.note}</p>{o.issue.answer&&<p>{o.issue.answer}</p>}<p>{t('noRefund')}</p></section>}
 {((!staff&&['handed_over','completed'].includes(o.stage)&&o.issue?.status!=='open')||(staff&&o.issue?.status==='open'))&&<><label>{t(staff?'answerNote':'issueNote')}<textarea maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label><button disabled={note.trim().length<3} onClick={()=>onAction(staff?'answer_issue':'report_issue',{note:note.trim()})}>{t(staff?'answerIssue':'reportIssue')}</button></>}
 {staff&&['picking','ready'].includes(o.stage)&&<MarketReopen locale={locale} onAction={onAction}/>}
 <MarketReopenHistory order={o} locale={locale}/>
 <MarketReturns order={o} locale={locale} staff={staff} onAction={onAction}/>
 <MarketCreditSummary order={o} locale={locale}/>
 <MarketProposal order={o} locale={locale} staff={staff} products={products} onAction={onAction}/>
 </fieldset></article>;
}
