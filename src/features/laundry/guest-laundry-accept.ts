import type {Attempt} from '../service-orders/model';
import {parseLaundryDetail} from './GuestLaundryDetail';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export function laundryAcceptAttempt(intakeId:string,revision:number,totalMinor:string,key:string):Attempt{
 if(!uuid.test(intakeId)||!uuid.test(key)||!Number.isSafeInteger(revision)||revision<1||typeof totalMinor!=='string'||!/^[1-9]\d{0,18}$/.test(totalMinor)||BigInt(totalMinor)>9223372036854775807n)throw Error('SERVICE_INPUT_INVALID');
 return {route:`services/laundry/${intakeId}/actions`,key,body:{action:'accept',expectedRevision:revision,expectedTotalMinor:totalMinor}};
}
export function assertLaundryAcceptReceipt(raw:unknown,attempt:Attempt):void{
 try{
  const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null,revision=attempt.body.expectedRevision;
  if(!r||r.intakeId!==attempt.route.split('/')[2]||r.stage!=='accepted'||typeof revision!=='number'||r.revision!==revision+1||typeof r.orderId!=='string'||!uuid.test(r.orderId)||typeof r.idempotentReplay!=='boolean'||r.totalMinor!==attempt.body.expectedTotalMinor)throw Error();
  const detail=parseLaundryDetail(r);if(!detail.items||!detail.returnBy)throw Error();
 }catch{throw Error('INVALID_RESPONSE');}
}
