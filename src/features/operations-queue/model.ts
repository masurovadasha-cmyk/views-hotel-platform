export const kinds=['cleaning','laundry','market','concierge'] as const;
export type Kind=typeof kinds[number];
export type Row={id:string;kind:Kind;stage:string;revision:number;unitCode:string|null;sla:null|{policy:'concierge-response-15m-v1';hypothesis:true;evaluatedAt:string;responseDueAt:string;state:string;overdueSeconds:number;answeredLate:boolean|null}};
export type Section={kind:Kind;status:'available'|'forbidden'|'disabled';items:Row[];nextCursor:string|null};
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export function parseQueue(raw:unknown,only?:Kind):Section[]{
 const fail=():never=>{throw Error('QUEUE_RESPONSE_INVALID');};
 if(!raw||typeof raw!=='object'||!('sections'in raw)||!Array.isArray(raw.sections))return fail();
 const expected=only?[only]:[...kinds];
 if(raw.sections.length!==expected.length)return fail();
 const seen=new Set<string>();
 return raw.sections.map((s:Section)=>{
  if(!s||!expected.includes(s.kind)||seen.has(s.kind)||!['available','forbidden','disabled'].includes(s.status)||!Array.isArray(s.items)||s.items.length>50||(s.nextCursor!==null&&!uuid(s.nextCursor)))return fail();seen.add(s.kind);
  if(s.status!=='available'&&(s.items.length||s.nextCursor!==null))return fail();
  const ids=new Set<string>();
  const items=s.items.map(r=>{
   if(!r||!uuid(r.id)||ids.has(r.id)||r.kind!==s.kind||typeof r.stage!=='string'||!/^[a-z_]{1,50}$/.test(r.stage)||!Number.isSafeInteger(r.revision)||r.revision<1||(r.unitCode!==null&&(typeof r.unitCode!=='string'||r.unitCode.length>120)))return fail();ids.add(r.id);
   const a=r.sla;
   if(s.kind!=='concierge'&&a!==null)return fail();
   if(s.kind==='concierge'&&(!a||a.policy!=='concierge-response-15m-v1'||a.hypothesis!==true||!Number.isFinite(Date.parse(a.responseDueAt))||!Number.isFinite(Date.parse(a.evaluatedAt))||!['pending','overdue','answered','closed','cancelled'].includes(a.state)||!Number.isSafeInteger(a.overdueSeconds)||a.overdueSeconds<0||(a.answeredLate!==null&&typeof a.answeredLate!=='boolean')))return fail();
   return {id:r.id,kind:r.kind,stage:r.stage,revision:r.revision,unitCode:r.unitCode,sla:a};
  });
  if(s.nextCursor!==null&&s.nextCursor!==items.at(-1)?.id)return fail();
  return {kind:s.kind,status:s.status,items,nextCursor:s.nextCursor};
 });
}
export function appendSection(previous:Section,incoming:Section):Section{
 if(previous.kind!==incoming.kind)throw Error('QUEUE_RESPONSE_INVALID');
 if(incoming.status!=='available')return incoming;
 const rows=new Map(previous.items.map(row=>[row.id,row]));
 for(const row of incoming.items)rows.set(row.id,row);
 return {...incoming,items:[...rows.values()]};
}
