import {ConciergeGuestContext} from './ConciergeGuestContext';
import type {KnowledgeArticle} from './support-model';
import {supportText} from './support-locale';
import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {localeTags} from '../local-core/staff-locale';
import {marketMoney} from '../market-core/format';
import {conciergeText} from './locale';
import type {ConciergeRequest} from './model';
export function ConciergeConversation({order:r,locale,staff,staffCsrf,snippet,manager=false,disabled,onAction}:{staffCsrf?:string;snippet?:KnowledgeArticle|null;order:ConciergeRequest;locale:Locale;staff:boolean;manager?:boolean;disabled:boolean;onAction:(action:string,fields?:Record<string,unknown>)=>void}){
 const t=(k:string)=>conciergeText(locale,k),[message,setMessage]=useState(''),[checked,setChecked]=useState(false),[cancel,setCancel]=useState(false);
 const live=!['closed','cancelled'].includes(r.stage),canReply=live&&(!staff||r.mine)&&r.messages.length<100;
 const bytes=r.messages.reduce((n,m)=>n+new TextEncoder().encode(m.text).length,0),messageFits=!!message.trim()&&bytes+new TextEncoder().encode(message.trim()).length<=16000;
 const when=(v:string)=>new Intl.DateTimeFormat(localeTags[locale],{dateStyle:'medium',timeStyle:'short'}).format(new Date(v));
 return <article className="localPanel conciergeCard" data-concierge-id={r.orderId}><header><h4>{t(r.category)} · #{r.orderId.slice(0,8)}{r.unitCode&&' · '+r.unitCode}</h4><strong className="conciergeStatus">{t(r.stage)}</strong></header>
 <p>{t('partySize')}: {r.partySize} · {when(r.requestedFor)}</p><p>{t('budget')}: {marketMoney(r.budgetMinor,r.currency,locale)}</p>
 <p>{t(r.assigned?'assigned':'unassigned')}</p>{live&&r.stage!=='answered'&&<p>{t('due')}: {when(r.responseDueAt)}{Date.parse(r.responseDueAt)<Date.now()&&<strong> · {t('overdue')}</strong>}</p>}
 <ol className="conciergeMessages">{r.messages.map(m=><li key={m.id} className={'conciergeMessage '+m.author}><small>{t(m.author)} · {when(m.createdAt)}</small><p>{m.text}</p></li>)}</ol>
 {staff&&staffCsrf&&(manager||r.mine)&&<ConciergeGuestContext orderId={r.orderId} csrf={staffCsrf} locale={locale} disabled={disabled}/>}
 <fieldset disabled={disabled}>
 {staff&&r.stage==='requested'&&!r.assigned&&<button onClick={()=>onAction('claim')}>{t('claim')}</button>}
 {staff&&r.stage==='working'&&(r.mine||manager)&&<button onClick={()=>onAction('release')}>{t('release')}</button>}
 {canReply&&<>{staff&&snippet&&<div><p>{supportText(locale,'source')}: {snippet.title} · v{snippet.revision} · {snippet.language.toUpperCase()}</p><p>{supportText(locale,'checkSource')}</p><button onClick={()=>{setMessage(snippet.content);setChecked(false);}}>{supportText(locale,'insert')}</button></div>}<label>{t('message')}<input maxLength={500} value={message} onChange={e=>{setMessage(e.target.value);setChecked(false);}}/></label><p>{t('privacy')}</p><button disabled={!messageFits} onClick={()=>onAction('message',{message:message.trim()})}>{t('send')}</button>
 {staff&&<><label><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>{t('checked')}</label><button disabled={!checked||!messageFits} onClick={()=>onAction('answer',{message:message.trim()})}>{t('answer')}</button></>}</>}
 {live&&(r.messages.length>=100||bytes>=16000||!!message.trim()&&!messageFits)&&<p role="status">{t('limit')}</p>}
 {!staff&&r.stage==='answered'&&<button onClick={()=>onAction('close')}>{t('close')}</button>}
 {!staff&&live&&<><label><input type="checkbox" checked={cancel} onChange={e=>setCancel(e.target.checked)}/>{t('cancelConsent')}</label><button disabled={!cancel} onClick={()=>onAction('cancel')}>{t('cancel')}</button></>}
 </fieldset></article>;
}
