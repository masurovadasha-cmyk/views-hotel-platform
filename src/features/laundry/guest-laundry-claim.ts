import type {Attempt} from '../service-orders/model';
import type {LaundryClaimState} from './model';
import {parseLaundryDetail} from './GuestLaundryDetail';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
type Fields={tag:string;kind:string;note:string};
type ClaimAttempt=Attempt&{claimExpectation:{stage:string;totalMinor:string;currency:string}};
export function canReportLaundry(stage:string,claim?:LaundryClaimState|null){return ['accepted','washing','ready','delivered','closed'].includes(stage)&&claim?.status!=='open'&&(claim?.history.length??0)<8;}
export function laundryClaimAttempt(intakeId:string,revision:number,stage:string,totalMinor:string,currency:string,fields:Fields,key:string):ClaimAttempt{
 if(!uuid.test(intakeId)||!uuid.test(key)||!Number.isSafeInteger(revision)||revision<1||!canReportLaundry(stage)||typeof totalMinor!=='string'||!/^[1-9]\d{0,18}$/.test(totalMinor)||BigInt(totalMinor)>9223372036854775807n||!['UZS','USD','EUR'].includes(currency)||!fields||Array.isArray(fields)||typeof fields.tag!=='string'||!/^[A-Z0-9-]{1,24}$/.test(fields.tag)||!['quality','missing','damaged'].includes(fields.kind)||typeof fields.note!=='string'||fields.note.trim().length<3||fields.note.trim().length>500||/[\u0000-\u001f\u007f]/.test(fields.note))throw Error('SERVICE_INPUT_INVALID');
 return {route:`services/laundry/${intakeId}/actions`,key,body:{action:'report_claim',expectedRevision:revision,tag:fields.tag,kind:fields.kind,note:fields.note.trim()},claimExpectation:{stage,totalMinor,currency}};
}
export function assertLaundryClaimReceipt(raw:unknown,attempt:Attempt):void{
 try{
  const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null,expected=(attempt as Partial<ClaimAttempt>).claimExpectation;
  if(!expected||typeof expected!=='object'||Array.isArray(expected))throw Error();
  const canonical=laundryClaimAttempt(attempt.route.split('/')[2],attempt.body.expectedRevision as number,expected.stage,expected.totalMinor,expected.currency,attempt.body as Fields,attempt.key);
  if(attempt.route!==canonical.route||attempt.body.action!=='report_claim'||attempt.body.note!==canonical.body.note||!r||r.intakeId!==attempt.route.split('/')[2]||r.stage!==expected.stage||r.revision!==(attempt.body.expectedRevision as number)+1||r.totalMinor!==expected.totalMinor||r.currency!==expected.currency||typeof r.orderId!=='string'||!uuid.test(r.orderId)||typeof r.idempotentReplay!=='boolean')throw Error();
  const detail=parseLaundryDetail(r),claim=detail.claim,last=claim?.history.at(-1);
  if(!detail.items||!detail.returnBy||claim?.status!=='open'||claim.tag!==attempt.body.tag||claim.kind!==attempt.body.kind||last?.action!=='report_claim'||last.note!==attempt.body.note||last.tag!==attempt.body.tag||last.kind!==attempt.body.kind)throw Error();
 }catch{throw Error('INVALID_RESPONSE');}
}
