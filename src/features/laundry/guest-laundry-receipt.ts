import type {Attempt} from '../service-orders/model';
import {parseLaundryDetail} from './GuestLaundryDetail';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
type ReceiptAttempt=Attempt&{receiptExpectation:{totalMinor:string;currency:string}};
export function laundryReceiptAttempt(intakeId:string,revision:number,totalMinor:string,currency:string,key:string):ReceiptAttempt{
 if(!uuid.test(intakeId)||!uuid.test(key)||!Number.isSafeInteger(revision)||revision<1||typeof totalMinor!=='string'||!/^[1-9]\d{0,18}$/.test(totalMinor)||BigInt(totalMinor)>9223372036854775807n||!['UZS','USD','EUR'].includes(currency))throw Error('SERVICE_INPUT_INVALID');
 return {route:`services/laundry/${intakeId}/actions`,key,body:{action:'confirm_receipt',expectedRevision:revision},receiptExpectation:{totalMinor,currency}};
}
export function assertLaundryReceipt(raw:unknown,attempt:Attempt):void{
 try{
  const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null;
  const expected=(attempt as Partial<ReceiptAttempt>).receiptExpectation,revision=attempt.body.expectedRevision;
  if(!expected||typeof expected!=='object'||Array.isArray(expected))throw Error();
  const canonical=laundryReceiptAttempt(attempt.route.split('/')[2],revision as number,expected.totalMinor,expected.currency,attempt.key);
  if(attempt.route!==canonical.route||attempt.body.action!=='confirm_receipt'||!r||r.intakeId!==attempt.route.split('/')[2]||r.stage!=='closed'||typeof revision!=='number'||r.revision!==revision+1||typeof r.orderId!=='string'||!uuid.test(r.orderId)||typeof r.idempotentReplay!=='boolean'||r.totalMinor!==expected.totalMinor||r.currency!==expected.currency)throw Error();
  const detail=parseLaundryDetail(r);if(!detail.items||!detail.returnBy||detail.claim&&detail.claim.status!=='resolved')throw Error();
 }catch{throw Error('INVALID_RESPONSE');}
}
