export type Locale='ru'|'uz'|'en';
export type Assignment={assignmentId:string;kind:'concierge';status:'offered'|'accepted'|'rejected'|'withdrawn'|'expired';revision:number;termsVersion:1;requestedFor:string;expiresAt:string;synthetic:true};
export type DispatchOrder={orderId:string;kind:'concierge';revision:number;requestedFor:string;grantsTruncated:boolean;grants:{grantId:string;label:string}[]};
export type Page<T>={items:T[];nextCursor:string|null};
export type OfferBody={orderId:string;grantId:string;expectedOrderRevision:number;expiresAt:string};
export type DecisionBody={action:'accept'|'reject';expectedRevision:number;termsVersion:1};
export type Receipt=Assignment&{idempotentReplay:boolean};
export type Command={key:string;scope:string;kind:'offer';body:OfferBody}|{key:string;scope:string;kind:'decision';assignmentId:string;body:DecisionBody};
export type Journal={format:1;revision:number;command:Command|null};
export type PartnerDispatchApi={list:(propertyId:string,after?:string)=>Promise<unknown>;offer:(body:OfferBody,key:string)=>Promise<unknown>};
export type PartnerAssignmentsApi={list:(after?:string)=>Promise<unknown>;decide:(id:string,body:DecisionBody,key:string)=>Promise<unknown>};
export class PartnerApiError extends Error{constructor(public code:string,public status:number){super(code);}}
export const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const iso=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&/^\d{4}-\d\d-\d\dT/.test(v)&&Number.isFinite(Date.parse(v));
export function scopeValid(scope:string){return typeof scope==='string'&&scope.length>0&&scope.length<=200&&!/[\u0000-\u001f]/.test(scope);}
export function assignment(v:unknown):Assignment{
 if(!object(v)||!uuid(v.assignmentId)||v.kind!=='concierge'||!['offered','accepted','rejected','withdrawn','expired'].includes(String(v.status))||!integer(v.revision)||v.termsVersion!==1||!iso(v.requestedFor)||!iso(v.expiresAt)||v.synthetic!==true)throw Error('invalid-response');
 // Only explicitly permitted projection fields enter UI state; no PII/money passthrough.
 return {assignmentId:v.assignmentId,kind:'concierge',status:v.status as Assignment['status'],revision:v.revision,termsVersion:1,requestedFor:v.requestedFor,expiresAt:v.expiresAt,synthetic:true};
}
export function dispatchOrder(v:unknown):DispatchOrder{
 if(!object(v)||!uuid(v.orderId)||v.kind!=='concierge'||!integer(v.revision)||!iso(v.requestedFor)||typeof v.grantsTruncated!=='boolean'||!Array.isArray(v.grants)||v.grants.length>50)throw Error('invalid-response');
 const grants=v.grants.map(g=>{if(!object(g)||!uuid(g.grantId)||typeof g.label!=='string'||g.label.length>200)throw Error('invalid-response');return {grantId:g.grantId,label:g.label};});
 return {orderId:v.orderId,kind:'concierge',revision:v.revision,requestedFor:v.requestedFor,grantsTruncated:v.grantsTruncated,grants};
}
export function page<T>(v:unknown,parse:(v:unknown)=>T):Page<T>{if(!object(v)||!Array.isArray(v.items)||v.items.length>200||(v.nextCursor!==null&&!uuid(v.nextCursor)))throw Error('invalid-response');return {items:v.items.map(parse),nextCursor:v.nextCursor};}
export function receipt(v:unknown):Receipt{if(!object(v)||typeof v.idempotentReplay!=='boolean')throw Error('invalid-response');return {...assignment(v),idempotentReplay:v.idempotentReplay};}
export function command(v:unknown):Command{
 if(!object(v)||!uuid(v.key)||typeof v.scope!=='string'||!scopeValid(v.scope)||!object(v.body))throw Error('journal');
 const b=v.body;
 if(v.kind==='offer'&&Object.keys(v).sort().join()==='body,key,kind,scope'&&Object.keys(b).sort().join()==='expectedOrderRevision,expiresAt,grantId,orderId'&&uuid(b.orderId)&&uuid(b.grantId)&&integer(b.expectedOrderRevision)&&iso(b.expiresAt))return {kind:'offer',key:v.key,scope:v.scope,body:{orderId:b.orderId,grantId:b.grantId,expectedOrderRevision:b.expectedOrderRevision,expiresAt:b.expiresAt}};
 if(v.kind==='decision'&&Object.keys(v).sort().join()==='assignmentId,body,key,kind,scope'&&Object.keys(b).sort().join()==='action,expectedRevision,termsVersion'&&uuid(v.assignmentId)&&['accept','reject'].includes(String(b.action))&&integer(b.expectedRevision)&&b.termsVersion===1)return {kind:'decision',key:v.key,scope:v.scope,assignmentId:v.assignmentId,body:{action:b.action as 'accept'|'reject',expectedRevision:b.expectedRevision,termsVersion:1}};
 throw Error('journal');
}
export type JournalOp={kind:'read'}|{kind:'reserve';revision:number;command:Command}|{kind:'settle';revision:number;key:string};
export function decideJournal(raw:unknown,scope:string,op:JournalOp):Journal{
 if(!scopeValid(scope))throw Error('journal');let current:Journal={format:1,revision:0,command:null};
 if(raw!==undefined){if(!object(raw)||Object.keys(raw).sort().join()!=='command,format,revision'||raw.format!==1||!integer(raw.revision))throw Error('journal');current={format:1,revision:raw.revision,command:raw.command===null?null:command(raw.command)};if(current.command&&(current.revision<1||current.command.scope!==scope))throw Error('journal');}
 if(op.kind==='read')return current;
 if(current.revision!==op.revision)throw Error('changed');
 if(current.revision===Number.MAX_SAFE_INTEGER)throw Error('journal');
 if(op.kind==='reserve'){const next=command(op.command);if(current.command||next.scope!==scope)throw Error('changed');return {format:1,revision:current.revision+1,command:next};}
 if(!current.command||current.command.key!==op.key)throw Error('changed');return {format:1,revision:current.revision+1,command:null};
}
