import {parseRecoveryScope,recoveryScopeKey,type RecoveryScope} from './booking-recovery';
export type CalendarCommand={action:'block';unitId:string;kind:'host_block'|'maintenance';start:string;end:string}|{action:'unblock';periodId:string};
export type CalendarAttempt={version:1;scope:RecoveryScope;body:CalendarCommand;key:string};
export type CalendarReceipt={propertyId:string;periodId:string|null;status:'blocked'|'unblocked'|'not_applied';currentState:'blocked'|'absent'|'changed';idempotentReplay:boolean};
export const calendarRecoveryDatabase='views.owner-calendar-recovery.v1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const invalid=():never=>{throw Error('CALENDAR_RECOVERY_INVALID');};
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))return invalid();return v as Record<string,unknown>;}
function keys(v:Record<string,unknown>,allowed:string){if(Object.keys(v).sort().join(',')!==allowed)return invalid();}
export function parseCalendarBody(value:unknown):CalendarCommand{
 const v=object(value);
 if(v.action==='unblock'){keys(v,'action,periodId');if(typeof v.periodId!=='string'||!id.test(v.periodId))return invalid();return {action:'unblock',periodId:v.periodId};}
 keys(v,'action,end,kind,start,unitId');
 if(v.action!=='block'||typeof v.unitId!=='string'||!id.test(v.unitId)||(v.kind!=='host_block'&&v.kind!=='maintenance'))return invalid();
 for(const x of [v.start,v.end]){if(typeof x!=='string'||!/^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}\+05:00$/.test(x)||!Number.isFinite(Date.parse(x))||new Date(Date.parse(x)+5*3600000).toISOString().slice(0,16)!==x.slice(0,16))return invalid();}
 const duration=Date.parse(v.end as string)-Date.parse(v.start as string);if(duration<=0||duration>366*86400000)return invalid();
 return {action:'block',unitId:v.unitId,kind:v.kind,start:v.start as string,end:v.end as string};
}
export function parseCalendarAttempt(value:unknown,scope:RecoveryScope):CalendarAttempt{
 const v=object(value);keys(v,'body,key,scope,version');
 if(v.version!==1||typeof v.key!=='string'||!uuid.test(v.key)||recoveryScopeKey(parseRecoveryScope(v.scope))!==recoveryScopeKey(scope))return invalid();
 return {version:1,scope:parseRecoveryScope(v.scope),key:v.key,body:parseCalendarBody(v.body)};
}
export function parseCalendarReceipt(value:unknown,attempt:CalendarAttempt):CalendarReceipt{
 const v=object(value);if(v.propertyId!==attempt.scope.propertyId||typeof v.idempotentReplay!=='boolean'||!['blocked','absent','changed'].includes(String(v.currentState)))return invalid();
 if(v.status==='not_applied'){if(v.periodId!==null||v.currentState!=='absent')return invalid();}
 else if(v.status!==(attempt.body.action==='block'?'blocked':'unblocked')||typeof v.periodId!=='string'||!id.test(v.periodId)||attempt.body.action==='unblock'&&v.periodId!==attempt.body.periodId)return invalid();
 return v as unknown as CalendarReceipt;
}
// One transaction serializes claims from different tabs. No credentials or guest data are stored.
async function operation(scope:RecoveryScope,claim?:CalendarAttempt,remove?:CalendarAttempt):Promise<CalendarAttempt|null>{
 const key=recoveryScopeKey(scope);
 return new Promise((resolve,reject)=>{
  let failed=false;
  const fail=(error:unknown)=>{if(!failed){failed=true;reject(error instanceof Error?error:new Error('CALENDAR_RECOVERY_STORAGE'));}};
  let opening:IDBOpenDBRequest;
  try{opening=indexedDB.open(calendarRecoveryDatabase,1);}catch(e){fail(e);return;}
  opening.onupgradeneeded=()=>{opening.result.createObjectStore('attempts');};
  opening.onerror=()=>fail(opening.error);
  opening.onblocked=()=>fail(new Error('CALENDAR_RECOVERY_STORAGE'));
  opening.onsuccess=()=>{
   const db=opening.result;if(failed){db.close();return;}db.onversionchange=()=>db.close();
   let result:CalendarAttempt|null=null;
   let tx:IDBTransaction;
   try{tx=db.transaction('attempts',claim||remove?'readwrite':'readonly');}catch(e){db.close();fail(e);return;}
   const store=tx.objectStore('attempts');
   tx.oncomplete=()=>{db.close();if(!failed)resolve(result);};
   tx.onabort=()=>{db.close();fail(tx.error);};tx.onerror=()=>fail(tx.error);
   const request=store.get(key);
   request.onsuccess=()=>{try{
    result=request.result===undefined?null:parseCalendarAttempt(request.result,scope);
    if(remove&&result){if(result.key!==remove.key||JSON.stringify(result.body)!==JSON.stringify(remove.body))throw new Error('CALENDAR_RECOVERY_CONFLICT');store.delete(key);result=null;}
    if(claim&&!result){result=parseCalendarAttempt(claim,scope);store.put(result,key);}
   }catch(e){fail(e);tx.abort();}};
  };
 });
}
export const loadCalendarAttempt=(scope:RecoveryScope)=>operation(scope);
export const claimCalendarAttempt=(attempt:CalendarAttempt)=>operation(attempt.scope,parseCalendarAttempt(attempt,attempt.scope)) as Promise<CalendarAttempt>;
export const clearCalendarAttempt=(attempt:CalendarAttempt)=>operation(attempt.scope,undefined,attempt);
