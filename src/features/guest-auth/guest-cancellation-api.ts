import {GuestEmailError} from '../../api/guest-email';
export type CancellationPreview={quoteId:string;reservationId:string;currency:string;totalMinor:string;netCollectedMinor:string;penaltyMinor:string;refundMinor:string;refundBps:number;policyTimezone:string;checkInAt:string;expiresAt:string;refundStatus:'pending'|'not_required'};
export type CancellationReceipt={cancellationId:string;reservationId:string;refundMinor:string;penaltyMinor:string;currency:string;status:'cancelled';refundStatus:'pending'|'not_required';idempotentReplay:boolean};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const minor=(value:unknown):value is string=>typeof value==='string'&&/^\d{1,19}$/.test(value);
function invalid():never{throw new GuestEmailError('GUEST_CORE_UNAVAILABLE');}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))return invalid();return value as Record<string,unknown>;}
export function cancellationPreview(value:unknown,reservationId:string):CancellationPreview{
 const b=record(value);
 if(typeof b.quoteId!=='string'||!uuid.test(b.quoteId)||b.reservationId!==reservationId||typeof b.currency!=='string'||!/^[A-Z]{3}$/.test(b.currency)
  ||!minor(b.totalMinor)||!minor(b.netCollectedMinor)||!minor(b.penaltyMinor)||!minor(b.refundMinor)||typeof b.refundBps!=='number'||!Number.isInteger(b.refundBps)||b.refundBps<0||b.refundBps>10000
  ||typeof b.policyTimezone!=='string'||typeof b.checkInAt!=='string'||!Number.isFinite(Date.parse(b.checkInAt))||typeof b.expiresAt!=='string'||!Number.isFinite(Date.parse(b.expiresAt))
  ||!['pending','not_required'].includes(String(b.refundStatus)))return invalid();
 try{new Intl.DateTimeFormat('en',{timeZone:b.policyTimezone});}catch{return invalid();}
 if(BigInt(b.penaltyMinor)>BigInt(b.totalMinor)||BigInt(b.refundMinor)>BigInt(b.netCollectedMinor)||(b.refundStatus==='not_required')!==(BigInt(b.refundMinor)===0n))return invalid();
 return b as CancellationPreview;
}
export function cancellationReceipt(value:unknown,quote:CancellationPreview):CancellationReceipt{
 const b=record(value);
 if(typeof b.cancellationId!=='string'||!uuid.test(b.cancellationId)||b.reservationId!==quote.reservationId||b.currency!==quote.currency||b.status!=='cancelled'
  ||b.refundMinor!==quote.refundMinor||b.penaltyMinor!==quote.penaltyMinor||b.refundStatus!==quote.refundStatus||typeof b.idempotentReplay!=='boolean')return invalid();
 return b as CancellationReceipt;
}
async function request(reservationId:string,action:'preview'|'confirm',csrf:string,body:object,key?:string):Promise<unknown>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch('/guest-api/trips/'+encodeURIComponent(reservationId)+'/cancellation/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
   headers:{'Content-Type':'application/json','X-Views-Guest-Pilot':'1','X-Views-Guest-Csrf':csrf,...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(body),signal:controller.signal});
  const b=record(await response.json());
  if(!response.ok)throw new GuestEmailError(typeof b.error==='string'?b.error:'GUEST_CORE_UNAVAILABLE',typeof b.retryAfterSeconds==='number'?b.retryAfterSeconds:0);
  return b;
 }catch(error){if(error instanceof GuestEmailError)throw error;return invalid();}finally{clearTimeout(timer);}
}
export const guestCancellation={
 async preview(id:string,csrf:string){return cancellationPreview(await request(id,'preview',csrf,{}),id);},
 async confirm(quote:CancellationPreview,csrf:string,key:string){return cancellationReceipt(await request(quote.reservationId,'confirm',csrf,{quoteId:quote.quoteId},key),quote);}
};
