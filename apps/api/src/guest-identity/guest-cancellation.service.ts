import {BadRequestException,ConflictException,Injectable,NotFoundException,UnauthorizedException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import type {PoolClient} from 'pg';
import {DatabaseService} from '../database/database.service';
import {calculateCancellationRefund,type CancellationPolicySnapshot} from '../rates/cancellation';
import {allocateCancellation} from '../booking/cancellation-allocation';
import {PaymentRecoveryService} from '../payments/payment-recovery.service';
import {SecurityRateLimitService,RateLimitExceededError} from '../security/rate-limit.service';
import {HttpException} from '@nestjs/common';
import {GuestEmailService} from './guest-email.service';
const uuid=(s:unknown)=>{if(typeof s!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s))throw new BadRequestException('GUEST_CANCELLATION_INPUT_INVALID');return s;};
type State={organizationId:string;accountId:string;reservationId:string;propertyId:string;unitId:string;status:string;currency:string;totalMinor:string;checkInAt:string;policy:CancellationPolicySnapshot;
 periods:{kind:string;property_id:string;organization_id:string;unit_id:string}[];lines:{code:string;amountMinor:string;refundable:boolean;currency:string}[];intents:{id:string;organizationId:string;provider:string;currency:string;capturedMinor:string;refundedMinor:string}[];
 captures:{id:string;organizationId:string;paymentIntentId:string;currency:string;capturedMinor:string;refundedMinor:string}[];hasRefundRequests:boolean;finalized:boolean};
type Snapshot={fingerprint:State;requestedAt:string};
export type GuestCancellationReceipt={cancellationId:string;reservationId:string;currency:string;status:'cancelled';refundMinor:string;penaltyMinor:string;refundStatus:'pending'|'not_required';idempotentReplay:boolean};
const conflict=(code:string)=>new ConflictException('GUEST_CANCELLATION_'+code);
export function calculateGuestCancellation(s:State,at:string){
 if(s.status!=='confirmed'||Date.parse(s.checkInAt)<=Date.parse(at))throw conflict('NOT_AVAILABLE');
 try{
  if(s.finalized||s.hasRefundRequests||s.periods.length!==1||s.periods[0].kind!=='reservation'||s.periods[0].property_id!==s.propertyId||s.periods[0].organization_id!==s.organizationId||s.periods[0].unit_id!==s.unitId)throw Error();
  const total=BigInt(s.totalMinor),lines=s.lines.map(l=>({...l,amountMinor:BigInt(l.amountMinor)}));
  if(lines.some(l=>l.currency!==s.currency)||lines.reduce((n,l)=>n+l.amountMinor,0n)!==total)throw Error();
  const p=s.policy;
  if(p?.version!==1||!Array.isArray(p.rules)||!Array.isArray(p.nonRefundableLineCodes)||p.nonRefundableLineCodes.some(c=>typeof c!=='string')||p.rules.some(r=>!Number.isInteger(r.refundBps)||!Number.isFinite(r.minHoursBeforeCheckIn)))throw Error();
  new Intl.DateTimeFormat('en',{timeZone:p.propertyTimezone}).format();
  const calculated=calculateCancellationRefund({policy:p,requestedAt:at,checkInAt:s.checkInAt,lines});
  for(const intent of s.intents){const captures=s.captures.filter(c=>c.paymentIntentId===intent.id);
   if(intent.organizationId!==s.organizationId||intent.currency!==s.currency||captures.some(c=>c.currency!==s.currency||c.organizationId!==s.organizationId)||captures.reduce((n,c)=>n+BigInt(c.capturedMinor),0n)!==BigInt(intent.capturedMinor)||captures.reduce((n,c)=>n+BigInt(c.refundedMinor),0n)!==BigInt(intent.refundedMinor))throw Error();
  }
  const allocated=allocateCancellation(total,calculated.refundMinor,s.captures.map(c=>({...c,capturedMinor:BigInt(c.capturedMinor),refundedMinor:BigInt(c.refundedMinor)})));
  const calculation={penaltyMinor:allocated.penaltyMinor.toString(),netCollectedMinor:allocated.netCollectedMinor.toString(),refundMinor:allocated.refundMinor.toString(),refundBps:calculated.refundBps,limits:allocated.limits.map(c=>({id:c.id,refundLimitMinor:c.refundLimitMinor.toString(),reclassificationMinor:c.reclassificationMinor.toString()}))};
  const boundaries=p.rules.map(r=>Date.parse(s.checkInAt)-r.minHoursBeforeCheckIn*3600000).filter(t=>t>=Date.parse(at));
  const expiresAt=new Date(Math.min(Date.parse(at)+300000,Date.parse(s.checkInAt),...boundaries)).toISOString();
  return {calculation,expiresAt};
 }catch{throw conflict('RECONCILIATION_REQUIRED');}
}
@Injectable()
export class GuestCancellationService{
 constructor(private readonly db:DatabaseService,private readonly auth:GuestEmailService,private readonly recovery:PaymentRecoveryService,private readonly limits:SecurityRateLimitService){}
 private async run<T>(token:string,id:unknown,work:(c:PoolClient,hash:string,target:string,snapshot:Snapshot)=>Promise<T>){
  if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_GUEST_CANCELLATION_PILOT_ENABLED!=='true')throw new NotFoundException('GUEST_CANCELLATION_DISABLED');
  const account=await this.auth.session(token);
  try{await this.limits.consume('guest.cancellation.account',createHash('sha256').update(account.userId).digest('hex'),30,300);}catch(e){if(e instanceof RateLimitExceededError)throw new HttpException({message:'RATE_LIMITED',retryAfterSeconds:e.retryAfterSeconds},429);throw e;}
  const target=uuid(id),hash=createHash('sha256').update(token).digest('hex');
  try{
   const org=(await this.db.query<{org:string}>('SELECT app.guest_cancellation_scope($1,$2) org',[hash,target])).rows[0].org;
   // Organization is resolved from the authenticated guest's reservation, never input.
   // Only existing internal recovery uses this context; guest writes are narrow definers.
   return await this.db.withOrganization(org,async c=>{
    await c.query("SET LOCAL statement_timeout='10s'");
    const snapshot=(await c.query<{state:Snapshot}>('SELECT app.guest_cancellation_state($1,$2) state',[hash,target])).rows[0].state;
    if(snapshot.fingerprint.organizationId!==org)throw new NotFoundException('GUEST_TRIP_NOT_FOUND');
    return work(c,hash,target,snapshot);
   });
  }catch(error){const e=error as {code?:string;message?:string};if(e.code==='28000')throw new UnauthorizedException('GUEST_EMAIL_SESSION_INVALID');if(e.code==='P0002')throw new NotFoundException('GUEST_TRIP_NOT_FOUND');if(e.code==='40001')throw conflict('QUOTE_STALE');if(e.code==='23505')throw conflict('COMMAND_CONFLICT');throw error;}
 }
 async preview(token:string,id:unknown){return this.run(token,id,async(c,hash,target,{fingerprint:s,requestedAt})=>{
  const {calculation,expiresAt}=calculateGuestCancellation(s,requestedAt);
  const quoteId=(await c.query<{id:string}>('SELECT app.guest_cancellation_quote($1,$2,$3,$4,$5) id',[hash,target,s,calculation,expiresAt])).rows[0].id;
  return {quoteId,reservationId:target,currency:s.currency,totalMinor:s.totalMinor,netCollectedMinor:calculation.netCollectedMinor,penaltyMinor:calculation.penaltyMinor,refundMinor:calculation.refundMinor,refundBps:calculation.refundBps,policyTimezone:s.policy.propertyTimezone,checkInAt:s.checkInAt,expiresAt,refundStatus:calculation.refundMinor==='0'?'not_required' as const:'pending' as const};
 });}
 async confirm(token:string,id:unknown,quote:unknown,key:unknown){const quoteId=uuid(quote),command=uuid(key);return this.run(token,id,async(c,hash,target,{fingerprint:s,requestedAt})=>{
  const replay=(await c.query<{result:GuestCancellationReceipt|null}>('SELECT app.guest_cancellation_replay($1,$2,$3,$4) result',[hash,target,quoteId,command])).rows[0].result;
  if(replay)return replay;
  const {calculation}=calculateGuestCancellation(s,requestedAt);
  const result=(await c.query<{result:GuestCancellationReceipt}>('SELECT app.guest_cancellation_commit($1,$2,$3,$4,$5,$6) result',[hash,target,quoteId,command,s,calculation])).rows[0].result;
  for(const intent of s.intents)await this.recovery.ensureRefundsForIntent(c,{organizationId:s.organizationId,paymentIntentId:intent.id,provider:intent.provider,currency:intent.currency,reservationId:target});
  return result;
 });}
}
