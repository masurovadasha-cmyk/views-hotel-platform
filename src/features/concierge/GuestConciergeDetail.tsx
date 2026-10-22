import type {Locale} from '../../i18n/messages';
import {localeTags} from '../local-core/staff-locale';
import {conciergeText} from './locale';
import {parseConciergePage} from './model';
import './concierge.css';

/** Validated guest projection; discard private metadata even on nested records. */
export function parseConciergeDetail(raw:unknown){
 const r=parseConciergePage({items:[raw],nextCursor:null}).items[0];
 const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v)&&Number.isFinite(Date.parse(v));
 if(![r.requestedFor,r.responseDueAt,...r.messages.map(m=>m.createdAt),...(r.answeredAt===null?[]:[r.answeredAt]),...(r.sla?[r.sla.evaluatedAt]:[])].every(date)||new Set(r.messages.map(m=>m.id.toLowerCase())).size!==r.messages.length)throw Error('INVALID_RESPONSE');
 const s=r.sla;
 const sla=s?{policy:s.policy,hypothesis:s.hypothesis,evaluatedAt:s.evaluatedAt,responseDueAt:s.responseDueAt,state:s.state,overdueSeconds:s.overdueSeconds,answeredLate:s.answeredLate}:undefined;
 return {category:r.category,partySize:r.partySize,requestedFor:r.requestedFor,responseDueAt:r.responseDueAt,assigned:r.assigned,
  messages:r.messages.map(m=>({id:m.id,author:m.author,text:m.text,createdAt:m.createdAt})),sla};
}

export function GuestConciergeDetail({order:r,locale}:{order:ReturnType<typeof parseConciergeDetail>;locale:Locale}){
 const t=(key:string)=>conciergeText(locale,key);
 const when=(v:string)=>new Intl.DateTimeFormat(localeTags[locale],{dateStyle:'medium',timeStyle:'medium'}).format(new Date(v));
 const empty={en:'No messages yet.',ru:'Сообщений пока нет.',uz:'Hozircha xabarlar yo‘q.'};
 return <section className="conciergeWorkspace" data-testid="guest-concierge-detail">
  <h4>{t('details')}</h4><dl><dt>{t('category')}</dt><dd>{t(r.category)}</dd><dt>{t('partySize')}</dt><dd>{new Intl.NumberFormat(localeTags[locale]).format(r.partySize)}</dd><dt>{t('when')}</dt><dd><time dateTime={r.requestedFor}>{when(r.requestedFor)}</time></dd></dl>
  <p>{t(r.assigned?'assigned':'unassigned')}</p>
  <div className={'conciergeSla '+(r.sla?.state==='overdue'?'conciergeSlaOverdue':'')} data-testid="concierge-detail-sla">
   <p>{t('due')}: <time dateTime={r.responseDueAt}>{when(r.responseDueAt)}</time></p>
   {r.sla?<><p><strong>{t(r.sla.state==='pending'?'slaPending':r.sla.state)}</strong>{r.sla.answeredLate!==null&&<> · {t(r.sla.answeredLate?'slaAnsweredLate':'slaAnsweredOnTime')}</>}{r.sla.state==='overdue'&&<> · {t('slaLateSeconds')}: {new Intl.NumberFormat(localeTags[locale]).format(r.sla.overdueSeconds)}</>}</p><p>{t('slaSnapshot')}: <time dateTime={r.sla.evaluatedAt}>{when(r.sla.evaluatedAt)}</time></p></>:<p>{t('slaUnavailable')}</p>}
   <p>{t('slaManual')}</p><p>{t('slaTimezone')}</p>
  </div>
  <h4>{t('message')}</h4>{r.messages.length?<ol className="conciergeMessages">{r.messages.map(m=><li key={m.id} className={'conciergeMessage '+m.author}><small>{t(m.author)} · <time dateTime={m.createdAt}>{when(m.createdAt)}</time></small><p>{m.text}</p></li>)}</ol>:<p>{empty[locale]}</p>}
 </section>;
}
