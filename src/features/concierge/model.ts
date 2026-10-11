export type ConciergeRequest={orderId:string;stage:'requested'|'working'|'answered'|'closed'|'cancelled';revision:number;category:'restaurant'|'documents'|'help';partySize:number;budgetMinor:string;currency:string;requestedFor:string;responseDueAt:string;answeredAt:string|null;assigned:boolean;mine?:boolean;unitCode?:string;messages:{id:string;author:'guest'|'staff';text:string;createdAt:string}[]};
export function parseConciergePage(raw:unknown):{items:ConciergeRequest[];nextCursor:string|null}{
 const b=raw as {items:ConciergeRequest[];nextCursor:string|null},uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
 if(!b||!Array.isArray(b.items)||b.items.length>50||b.nextCursor!==null&&!uuid.test(b.nextCursor))throw Error('INVALID_RESPONSE');
 for(const r of b.items){
  if(!r||!uuid.test(r.orderId)||!['requested','working','answered','closed','cancelled'].includes(r.stage)||!Number.isSafeInteger(r.revision)||r.revision<1||!['restaurant','documents','help'].includes(r.category)||!Number.isInteger(r.partySize)||r.partySize<1||r.partySize>50||typeof r.budgetMinor!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(r.budgetMinor)||BigInt(r.budgetMinor)>9223372036854775807n||!/^[A-Z]{3}$/.test(r.currency)||typeof r.assigned!=='boolean'||![r.requestedFor,r.responseDueAt].every(v=>typeof v==='string'&&Number.isFinite(Date.parse(v)))||r.answeredAt!==null&&!Number.isFinite(Date.parse(r.answeredAt))||!Array.isArray(r.messages)||r.messages.length>100)throw Error('INVALID_RESPONSE');
  for(const m of r.messages)if(!m||!uuid.test(m.id)||!['guest','staff'].includes(m.author)||typeof m.text!=='string'||!m.text.length||m.text.length>500||!Number.isFinite(Date.parse(m.createdAt)))throw Error('INVALID_RESPONSE');
 }
 return b;
}
