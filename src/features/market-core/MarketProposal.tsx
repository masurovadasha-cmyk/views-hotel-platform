import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {localizedName,localeTags} from '../local-core/staff-locale';
import type {MarketOrder,MarketProduct} from './model';
import {marketMoney} from './format';
import {marketText} from './locale';
import {MarketQuantityProposal} from './MarketQuantityProposal';
export function MarketProposal({order:o,locale,staff,products,onAction}:{order:MarketOrder;locale:Locale;staff:boolean;products:MarketProduct[];onAction:(action:string,fields?:Record<string,unknown>)=>void}){
 const t=(k:string)=>marketText(locale,k),[from,setFrom]=useState(''),[to,setTo]=useState(''),[note,setNote]=useState(''),[consent,setConsent]=useState(false),p=o.proposal;
 return <>
 {staff&&o.stage==='reserved'&&p?.status!=='pending'&&<MarketQuantityProposal order={o} locale={locale} onAction={onAction}/>}
 {p&&<section data-testid="market-proposal"><h5>{t('proposal_'+p.status)}</h5>{p.kind==='quantity'&&<p>{t('quantityProposal')}</p>}<p>{p.note}</p>
 <ul>{p.lines.map(l=><li key={l.serviceId}>{localizedName(l.name,locale)} × {l.quantity} · {marketMoney((BigInt(l.priceMinor)*BigInt(l.quantity)).toString(),o.currency,locale)}</li>)}</ul>
 <p>{t('newTotal')}: <strong>{marketMoney(p.totalMinor,o.currency,locale)}</strong></p><p>{t('validUntil')}: {new Date(p.expiresAt).toLocaleString(localeTags[locale])}</p>
 {p.status==='pending'&&<><p>{t('proposalTerms')}</p>{staff?<button onClick={()=>onAction('withdraw_proposal')}>{t('withdrawProposal')}</button>:<><label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('proposalConsent')}</label><button disabled={!consent} onClick={()=>onAction('accept_proposal',{expectedTotalMinor:p.totalMinor})}>{t(p.kind==='quantity'?'acceptQuantity':'acceptProposal')}</button><button onClick={()=>onAction('decline_proposal')}>{t(p.kind==='quantity'?'declineQuantity':'declineProposal')}</button></>}</>}
 </section>}
 {staff&&o.stage==='reserved'&&p?.status!=='pending'&&<fieldset><legend>{t('propose')}</legend>
 <label>{t('replaceFrom')}<select aria-label={t('replaceFrom')} value={from} onChange={e=>setFrom(e.target.value)}><option value="">—</option>{o.lines.map(l=><option key={l.serviceId} value={l.serviceId}>{localizedName(l.name,locale)} × {l.quantity}</option>)}</select></label>
 <label>{t('replaceTo')}<select aria-label={t('replaceTo')} value={to} onChange={e=>setTo(e.target.value)}><option value="">—</option>{products.filter(p=>p.currency===o.currency&&!o.lines.some(l=>l.serviceId===p.id)).map(p=><option key={p.id} value={p.id}>{localizedName(p.name,locale)} · {marketMoney(p.priceMinor,p.currency,locale)}</option>)}</select></label>
 <label>{t('proposalNote')}<textarea maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
 <button disabled={!from||!to||note.trim().length<3} onClick={()=>onAction('propose_replacement',{fromServiceId:from,toServiceId:to,note:note.trim()})}>{t('sendProposal')}</button>
 </fieldset>}
 </>;
}
