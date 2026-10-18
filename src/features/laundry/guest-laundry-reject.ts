import type {Attempt} from '../service-orders/model';
import {parseLaundryDetail} from './GuestLaundryDetail';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export function laundryRejectAttempt(intakeId:string,revision:number,key:string):Attempt{
 if(!uuid.test(intakeId)||!uuid.test(key)||!Number.isSafeInteger(revision)||revision<1)throw Error('SERVICE_INPUT_INVALID');
 return {route:`services/laundry/${intakeId}/actions`,key,body:{action:'reject',expectedRevision:revision}};
}
export function assertLaundryRejectReceipt(raw:unknown,attempt:Attempt):void{
 try{
  const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null,revision=attempt.body.expectedRevision;
  if(!r||r.intakeId!==attempt.route.split('/')[2]||r.stage!=='awaiting_return'||typeof revision!=='number'||r.revision!==revision+1||r.orderId!==null||r.claim!=null||typeof r.idempotentReplay!=='boolean')throw Error();
  const detail=parseLaundryDetail(r);if(!detail.items||!detail.returnBy)throw Error();
 }catch{throw Error('INVALID_RESPONSE');}
}
