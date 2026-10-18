import type {Locale} from '../../i18n/messages';
import {localeTags} from '../local-core/staff-locale';
import {laundryMoney} from './LaundrySummary';
import {laundryText} from './locale';
import {claimText} from './claim-locale';
const MAX=9223372036854775807n;
function invalid():never{throw Error('INVALID_LAUNDRY_DETAIL');}
function record(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))invalid();return v as Record<string,unknown>;}
function text(v:unknown,max:number,empty=false){if(typeof v!=='string'||v.length>max||!empty&&!v.trim()||/[\u0000-\u001f\u007f]/.test(v))invalid();return v;}
function member<T extends string>(v:unknown,values:readonly T[]):T{if(typeof v!=='string'||!values.includes(v as T))invalid();return v as T;}
function money(v:unknown){if(typeof v!=='string'||!/^[1-9]\d{0,18}$/.test(v)||BigInt(v)>MAX)invalid();return v;}
function tag(v:unknown){const s=text(v,24);if(!/^[A-Z0-9-]+$/.test(s))invalid();return s;}
function timestamp(v:unknown){
 const s=text(v,40),parts=/^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.exec(s);
 if(!parts||!Number.isFinite(Date.parse(s)))invalid();
 const year=Number(parts[1]),month=Number(parts[2]),day=Number(parts[3]);
 if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate())invalid();return s;
}
/** Detail projection only: identifiers, stage and aggregate amount belong to the parent summary. */
export function parseLaundryDetail(raw:unknown){
 const r=record(raw),currency=member(r.currency,['UZS','USD','EUR'] as const);
 if(!Number.isInteger(r.declaredCount)||(r.declaredCount as number)<1||(r.declaredCount as number)>50)invalid();
 const preferences=text(r.preferences,500,true),pickupAt=timestamp(r.pickupAt),returnBy=r.returnBy===null?null:timestamp(r.returnBy);
 if(r.items!==null&&(!Array.isArray(r.items)||r.items.length<1||r.items.length>50))invalid();
 const items=r.items===null?null:(r.items as unknown[]).map(rawItem=>{
  const i=record(rawItem);return {tag:tag(i.tag),description:text(i.description,160),priceMinor:money(i.priceMinor)};
 });
 if(items){
  const total=items.reduce((sum,i)=>sum+BigInt(i.priceMinor),0n);
  if(new Set(items.map(i=>i.tag)).size!==items.length||total>MAX||total!==BigInt(money(r.totalMinor))||returnBy===null)invalid();
 }else if(r.totalMinor!==null)invalid();
 const claim=r.claim==null?null:(()=>{
  const c=record(r.claim),status=member(c.status,['open','answered','resolved'] as const),claimTag=tag(c.tag),kind=member(c.kind,['missing','damaged','quality'] as const);
  if(!items?.some(i=>i.tag===claimTag)||!Array.isArray(c.history)||c.history.length<1||c.history.length>9)invalid();
  const history=c.history.map(rawEvent=>{
   const e=record(rawEvent),action=member(e.action,['report_claim','answer_claim','resolve_claim'] as const),at=timestamp(e.at),note=text(e.note,500,action==='resolve_claim');
   if(action!=='resolve_claim'&&note.trim().length<3)invalid();
   if(action==='report_claim'){
    const eventTag=tag(e.tag),eventKind=member(e.kind,['missing','damaged','quality'] as const);
    if(!items?.some(i=>i.tag===eventTag))invalid();return {action,at,note,tag:eventTag,kind:eventKind};
   }
   return {action,at,note};
  });
  const expected={open:'report_claim',answered:'answer_claim',resolved:'resolve_claim'};
  if(history.at(-1)?.action!==expected[status])invalid();return {status,tag:claimTag,kind,history};
 })();
 return {declaredCount:r.declaredCount as number,preferences,pickupAt,returnBy,currency,items,claim};
}
const labels={
 pickup:['Requested pickup (device time zone)','Запрошенный забор (часовой пояс устройства)','So‘ralgan olib ketish (qurilma vaqt mintaqasi)'],
 pending:['The item inventory has not been prepared yet.','Опись вещей ещё не подготовлена.','Buyumlar ro‘yxati hali tayyorlanmagan.'],
 history:['Concern history (device time zone)','История претензии (часовой пояс устройства)','Murojaat tarixi (qurilma vaqt mintaqasi)'],
} as const;
export function GuestLaundryDetail({order:o,locale}:{order:ReturnType<typeof parseLaundryDetail>;locale:Locale}){
 const t=(key:string)=>laundryText(locale,key),c=(key:string)=>claimText(locale,key),l=(key:keyof typeof labels)=>labels[key][locale==='ru'?1:locale==='uz'?2:0];
 const when=(value:string)=>new Intl.DateTimeFormat(localeTags[locale],{dateStyle:'short',timeStyle:'short'}).format(new Date(value));
 return <section data-testid="guest-laundry-detail"><p>{t('count')}: {o.declaredCount}</p>
  <p>{l('pickup')}: <time dateTime={o.pickupAt}>{when(o.pickupAt)}</time></p>
  {o.preferences&&<p>{t('preferences')}: {o.preferences}</p>}
  <h4>{t('inventory')}</h4>{o.items?<div className="guestOrderList" role="list">{o.items.map(i=><article role="listitem" key={i.tag}><p>{i.tag} · {i.description}</p><strong>{laundryMoney(i.priceMinor,o.currency,locale)}</strong></article>)}</div>:<p>{l('pending')}</p>}
  {o.returnBy&&<p>{t('returnBy')}: <time dateTime={o.returnBy}>{when(o.returnBy)}</time></p>}
  {o.claim&&<section><h4>{c('title')}</h4><p>{c(o.claim.status)} · {o.claim.tag} · {c(o.claim.kind)}</p><p>{c('hint')}</p>
   <h5>{l('history')}</h5><ol>{o.claim.history.map((e,index)=><li key={index}><small>{c(e.action)} · <time dateTime={e.at}>{when(e.at)}</time>{'tag' in e&&` · ${e.tag} · ${c(e.kind!)}`}</small>{e.note&&<p>{e.note}</p>}</li>)}</ol>
  </section>}
 </section>;
}
