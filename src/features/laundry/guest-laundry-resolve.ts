import type {Attempt} from '../service-orders/model';
import type {LaundryClaimState} from './model';
import {parseLaundryDetail} from './GuestLaundryDetail';
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
type ResolveAttempt=Attempt&{resolveExpectation:{stage:string;totalMinor:string;currency:string;tag:string;kind:string;historyLength:number}};
export function laundryResolveAttempt(intakeId:string,revision:number,stage:string,totalMinor:string,currency:string,claim:LaundryClaimState,key:string):ResolveAttempt{
 if(!uuid.test(intakeId)||!uuid.test(key)||!Number.isSafeInteger(revision)||revision<1||!['accepted','washing','ready','delivered','closed'].includes(stage)||typeof totalMinor!=='string'||!/^[1-9]\d{0,18}$/.test(totalMinor)||BigInt(totalMinor)>9223372036854775807n||!['UZS','USD','EUR'].includes(currency)||!claim||!['open','answered'].includes(claim.status)||typeof claim.tag!=='string'||!/^[A-Z0-9-]{1,24}$/.test(claim.tag)||!['quality','missing','damaged'].includes(claim.kind)||!Array.isArray(claim.history)||claim.history.length<1||claim.history.length>8)throw Error('SERVICE_INPUT_INVALID');
 return {route:`services/laundry/${intakeId}/actions`,key,body:{action:'resolve_claim',expectedRevision:revision},resolveExpectation:{stage,totalMinor,currency,tag:claim.tag,kind:claim.kind,historyLength:claim.history.length}};
}
export function assertLaundryResolveReceipt(raw:unknown,attempt:Attempt):void{
 try{
  const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null,e=(attempt as Partial<ResolveAttempt>).resolveExpectation;
  if(!e||!Number.isInteger(e.historyLength)||e.historyLength<1||e.historyLength>8)throw Error();
  if(!uuid.test(attempt.key)||!/^services\/laundry\/[a-f0-9-]+\/actions$/i.test(attempt.route)||attempt.body.action!=='resolve_claim'||!Number.isSafeInteger(attempt.body.expectedRevision)||(attempt.body.expectedRevision as number)<1||!r||!uuid.test(attempt.route.split('/')[2])||r.intakeId!==attempt.route.split('/')[2]||r.revision!==(attempt.body.expectedRevision as number)+1||r.stage!==e.stage||!['accepted','washing','ready','delivered','closed'].includes(e.stage)||r.totalMinor!==e.totalMinor||r.currency!==e.currency||typeof r.orderId!=='string'||!uuid.test(r.orderId)||typeof r.idempotentReplay!=='boolean')throw Error();
  const d=parseLaundryDetail(r),c=d.claim,last=c?.history.at(-1);
  if(!d.items||!d.returnBy||c?.status!=='resolved'||c.tag!==e.tag||c.kind!==e.kind||c.history.length!==e.historyLength+1||last?.action!=='resolve_claim'||last.note!=='')throw Error();
 }catch{throw Error('INVALID_RESPONSE');}
}
