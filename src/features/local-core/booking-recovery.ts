export type RecoveryScope={organizationId:string;userId:string;membershipId:string;propertyId:string};
export type HoldAttempt={version:1;scope:RecoveryScope;quoteId:string;key:string};
export type HoldReceipt={reservationId:string;confirmationCode:string;holdExpiresAt:string|null;status:string;activeHold:boolean;idempotentReplay:boolean};
export const bookingRecoveryDatabase='views.booking-recovery.v1';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('BOOKING_RECOVERY_INVALID');return v as Record<string,unknown>;};
function keys(v:Record<string,unknown>,expected:string[]){if(Object.keys(v).sort().join(',')!==expected.sort().join(','))throw new Error('BOOKING_RECOVERY_INVALID');}
function id(v:unknown){if(typeof v!=='string'||!uuid.test(v))throw new Error('BOOKING_RECOVERY_INVALID');return v;}
export function parseRecoveryScope(value:unknown):RecoveryScope{
 const v=object(value);keys(v,['organizationId','userId','membershipId','propertyId']);
 return {organizationId:id(v.organizationId),userId:id(v.userId),membershipId:id(v.membershipId),propertyId:id(v.propertyId)};
}
export function recoveryScopeKey(scope:RecoveryScope){const s=parseRecoveryScope(scope);return JSON.stringify([s.organizationId,s.userId,s.membershipId,s.propertyId]);}
export function parseHoldAttempt(value:unknown,scope:RecoveryScope):HoldAttempt{
 const v=object(value);keys(v,['version','scope','quoteId','key']);
 if(v.version!==1||recoveryScopeKey(parseRecoveryScope(v.scope))!==recoveryScopeKey(scope))throw new Error('BOOKING_RECOVERY_INVALID');
 return {version:1,scope:parseRecoveryScope(v.scope),quoteId:id(v.quoteId),key:id(v.key)};
}
export function parseHoldReceipt(value:unknown):HoldReceipt{
 const v=object(value),statuses=['hold','pending','confirmed','checked_in','checked_out','cancelled','no_show'];
 if(typeof v.status!=='string'||!statuses.includes(v.status)||typeof v.activeHold!=='boolean'||typeof v.idempotentReplay!=='boolean'||typeof v.confirmationCode!=='string'||!v.confirmationCode.trim()||v.confirmationCode.length>100||!(v.holdExpiresAt===null||typeof v.holdExpiresAt==='string'&&Number.isFinite(Date.parse(v.holdExpiresAt))))throw new Error('BOOKING_RECOVERY_INVALID');
 if(v.activeHold&&(v.status!=='hold'||v.holdExpiresAt===null))throw new Error('BOOKING_RECOVERY_INVALID');
 return {reservationId:id(v.reservationId),confirmationCode:v.confirmationCode,holdExpiresAt:v.holdExpiresAt as string|null,status:v.status,activeHold:v.activeHold,idempotentReplay:v.idempotentReplay};
}
export function isActiveRecoveredHold(receipt:HoldReceipt,now:number){return receipt.status==='hold'&&receipt.activeHold&&receipt.holdExpiresAt!==null&&Date.parse(receipt.holdExpiresAt)>now;}
export function definitiveHoldRejection(error:unknown){
 const e=error as {message?:unknown;httpStatus?:unknown}|null;
 return !!e&&e.httpStatus===409&&e.message==='HOLD_NOT_CREATED';
}
// One transaction serializes claims from different tabs. No credentials or guest data are stored.
async function operation(scope:RecoveryScope,claim?:HoldAttempt,remove?:HoldAttempt):Promise<HoldAttempt|null>{
 const key=recoveryScopeKey(scope);
 return new Promise((resolve,reject)=>{
  let failed=false;
  const fail=(error:unknown)=>{if(!failed){failed=true;reject(error instanceof Error?error:new Error('BOOKING_RECOVERY_STORAGE'));}};
  let opening:IDBOpenDBRequest;
  try{opening=indexedDB.open(bookingRecoveryDatabase,1);}catch(e){fail(e);return;}
  opening.onupgradeneeded=()=>{opening.result.createObjectStore('attempts');};
  opening.onerror=()=>fail(opening.error);
  opening.onblocked=()=>fail(new Error('BOOKING_RECOVERY_STORAGE'));
  opening.onsuccess=()=>{
   const db=opening.result;if(failed){db.close();return;}db.onversionchange=()=>db.close();
   let result:HoldAttempt|null=null;
   let tx:IDBTransaction;
   try{tx=db.transaction('attempts',claim||remove?'readwrite':'readonly');}catch(e){db.close();fail(e);return;}
   const store=tx.objectStore('attempts');
   tx.oncomplete=()=>{db.close();if(!failed)resolve(result);};
   tx.onabort=()=>{db.close();fail(tx.error);};tx.onerror=()=>fail(tx.error);
   const request=store.get(key);
   request.onsuccess=()=>{try{
    result=request.result===undefined?null:parseHoldAttempt(request.result,scope);
    if(remove&&result){if(result.key!==remove.key||result.quoteId!==remove.quoteId)throw new Error('BOOKING_RECOVERY_CONFLICT');store.delete(key);result=null;}
    if(claim&&!result){result=parseHoldAttempt(claim,scope);store.put(result,key);}
   }catch(e){fail(e);tx.abort();}};
  };
 });
}
export const loadHoldAttempt=(scope:RecoveryScope)=>operation(scope);
export const claimHoldAttempt=(attempt:HoldAttempt)=>operation(attempt.scope,parseHoldAttempt(attempt,attempt.scope)) as Promise<HoldAttempt>;
export const clearHoldAttempt=(attempt:HoldAttempt)=>operation(attempt.scope,undefined,attempt);
