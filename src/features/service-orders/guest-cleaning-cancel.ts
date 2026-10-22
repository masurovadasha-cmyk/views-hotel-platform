import type {Attempt} from './model';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export function cleaningCancelAttempt(orderId:string,revision:number,key:string):Attempt{
 if(!uuid.test(orderId)||!uuid.test(key)||!Number.isSafeInteger(revision)||revision<1)throw new Error('SERVICE_INPUT_INVALID');
 return {route:`services/orders/${orderId}/actions`,key,body:{action:'cancel',expectedRevision:revision}};
}
export function assertCleaningCancelReceipt(raw:unknown,attempt:Attempt):void{
 const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
 const expected=attempt.body.expectedRevision;
 if(!r||r.orderId!==attempt.route.split('/')[2]||r.stage!=='cancelled'||r.status!=='cancelled'||typeof expected!=='number'||!Number.isSafeInteger(r.revision)||r.revision!==expected+1||typeof r.idempotentReplay!=='boolean')throw new Error('INVALID_RESPONSE');
}
