import type {Locale} from '../../i18n/messages';
import {localeTags} from '../local-core/staff-locale';
import {cleaningText} from './locale';

/** Guest projection excludes staff completion/inspection notes, even if unexpectedly returned. */
export function parseCleaningDetail(raw:unknown){
 const fail=():never=>{throw new Error('GUEST_CLEANING_DETAIL_INVALID');};
 const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:fail();
 const value=record(raw),time=value.requestedFor;
 if(typeof time!=='string'||time.length>40||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(time)||!Number.isFinite(Date.parse(time)))return fail();
 let feedback:{rating:number;comment:string}|null=null;
 if(value.feedback!==undefined&&value.feedback!==null){
  const f=record(value.feedback),rating=f.rating,comment=f.comment;
  if(typeof rating!=='number'||!Number.isInteger(rating)||rating<1||rating>5||typeof comment!=='string'||comment.length>500||/[\u0000-\u001f\u007f-\u009f]/.test(comment))return fail();
  feedback={rating,comment};
 }
 return {requestedFor:new Date(time).toISOString(),feedback};
}
const labels:Record<Locale,{time:string;zone:string}>={
 ru:{time:'Запрошенное время',zone:'Часовой пояс устройства'},
 uz:{time:'So‘ralgan vaqt',zone:'Qurilma vaqt mintaqasi'},
 en:{time:'Requested time',zone:'Device time zone'}
};
export function GuestCleaningDetail({order,locale}:{order:ReturnType<typeof parseCleaningDetail>;locale:Locale}){
 const t=labels[locale];
 return <section className="localPanel" data-testid="guest-cleaning-detail"><h4>{t.time}</h4>
  <time dateTime={order.requestedFor}>{new Date(order.requestedFor).toLocaleString(localeTags[locale],{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'})}</time><p>{t.zone}</p>
  {order.feedback&&<div data-testid="guest-cleaning-detail-feedback"><h4>{cleaningText(locale,'rating')}</h4><p>{order.feedback.rating} / 5</p>{order.feedback.comment&&<p>{order.feedback.comment}</p>}</div>}
 </section>;
}
