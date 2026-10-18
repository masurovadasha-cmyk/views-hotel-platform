import type {Attempt} from '../service-orders/model';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export function laundryCancelAttempt(intakeId:string,revision:number,key:string):Attempt{
 if(!uuid.test(intakeId)||!uuid.test(key)||!Number.isSafeInteger(revision)||revision<1)throw Error('SERVICE_INPUT_INVALID');
 return {route:`services/laundry/${intakeId}/actions`,key,body:{action:'cancel',expectedRevision:revision}};
}
export function assertLaundryCancelReceipt(raw:unknown,attempt:Attempt):void{
 const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null,expected=attempt.body.expectedRevision;
 if(!r||r.intakeId!==attempt.route.split('/')[2]||r.stage!=='cancelled'||typeof expected!=='number'||!Number.isSafeInteger(r.revision)||r.revision!==expected+1||typeof r.idempotentReplay!=='boolean'||r.orderId!==null||r.totalMinor!==null||r.items!==null)throw Error('INVALID_RESPONSE');
}
