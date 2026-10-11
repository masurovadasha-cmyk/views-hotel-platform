import {ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
import {calculateCancellationRefund,type CancellationPolicySnapshot} from '../rates/cancellation';
import {PaymentRecoveryService} from '../payments/payment-recovery.service';
import {allocateCancellation} from './cancellation-allocation';
import {calendarId} from '../owner/owner-calendar.input';
@Injectable()
export class BookingCancellationService{
 constructor(private readonly db:DatabaseService,private readonly recovery:PaymentRecoveryService){}
 async cancel(actor:RequestActorContext,reservationId:string,key:string){
  if(process.env.NODE_ENV!=='test'||process.env.VIEWS_LOCAL_REHEARSAL!=='true'||process.env.VIEWS_CANCELLATION_PILOT_ENABLED!=='true')throw new NotFoundException('CANCELLATION_DISABLED');
  const id=calendarId(reservationId),commandKey=calendarId(key);
  return this.db.withActor(actor,async c=>{
   await c.query("SET LOCAL statement_timeout='10s'");
   const scope=(await c.query("SELECT app.registry_access(organization_id,property_id,'reservation.manage') allowed FROM reservations WHERE id=$1 AND organization_id=$2",[id,actor.organizationId])).rows[0];
   if(!scope?.allowed)throw new ForbiddenException('PROPERTY_FORBIDDEN');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['policy-cancel:'+actor.organizationId+':'+commandKey]);
   // Same lock order as captured-payment webhooks: intents, then reservation.
   const intents=(await c.query<{id:string;provider:string;currency:string;captured_minor:string;refunded_minor:string}>(
    'SELECT id,provider,currency,captured_minor::text,refunded_minor::text FROM payment_intents WHERE reservation_id=$1 ORDER BY id FOR UPDATE',[id])).rows;
   const booking=(await c.query<{property_id:string;currency:string;status:string;total_minor:string;check_in_at:Date;cancellation_policy_snapshot:CancellationPolicySnapshot}>(
    'SELECT property_id,currency,status,total_minor::text,check_in_at,cancellation_policy_snapshot FROM reservations WHERE id=$1 FOR UPDATE',[id])).rows[0];
   const prior=(await c.query('SELECT reservation_id,refund_minor::text,penalty_minor::text,id FROM booking_cancellations WHERE organization_id=$1 AND idempotency_key=$2',[actor.organizationId,commandKey])).rows[0];
   if(prior){if(prior.reservation_id!==id)throw new ConflictException('IDEMPOTENCY_CONFLICT');return {cancellationId:prior.id,reservationId:id,refundMinor:prior.refund_minor,penaltyMinor:prior.penalty_minor,idempotentReplay:true};}
   if(booking.status!=='confirmed')throw new ConflictException('CANCELLATION_NOT_AVAILABLE');
   if((await c.query("SELECT 1 FROM reservation_economic_snapshots WHERE reservation_id=$1 AND status='finalized'",[id])).rowCount)throw new ConflictException('CANCELLATION_RECONCILIATION_REQUIRED');
   if((await c.query("SELECT 1 FROM payment_refund_requests WHERE payment_intent_id=ANY($1::uuid[])",[intents.map(p=>p.id)])).rowCount)throw new ConflictException('CANCELLATION_RECONCILIATION_REQUIRED');
   const periods=(await c.query("SELECT count(*)::int n FROM inventory_periods WHERE reservation_id=$1 AND kind='reservation' AND property_id=$2",[id,booking.property_id])).rows[0].n;
   if(periods!==1)throw new ConflictException('CANCELLATION_RECONCILIATION_REQUIRED');
   const requestedAt=(await c.query('SELECT clock_timestamp() AS at')).rows[0].at as Date;
   if(booking.check_in_at<=requestedAt)throw new ConflictException('CANCELLATION_NOT_AVAILABLE');
   const lines=(await c.query<{code:string;amount_minor:string;refundable:boolean}>('SELECT code,amount_minor::text,refundable FROM reservation_price_lines WHERE reservation_id=$1 ORDER BY sort_order,id',[id])).rows;
   const total=BigInt(booking.total_minor);
   if(lines.reduce((sum,l)=>sum+BigInt(l.amount_minor),0n)!==total)throw new ConflictException('CANCELLATION_RECONCILIATION_REQUIRED');
   const calculation=calculateCancellationRefund({policy:booking.cancellation_policy_snapshot,requestedAt:requestedAt.toISOString(),checkInAt:booking.check_in_at.toISOString(),lines:lines.map(l=>({code:l.code,amountMinor:BigInt(l.amount_minor),refundable:l.refundable}))});
   const captures=(await c.query<{id:string;payment_intent_id:string;captured_minor:string;refunded_minor:string}>(`SELECT t.id,t.payment_intent_id,t.amount_minor::text captured_minor,
    COALESCE((SELECT sum(r.amount_minor) FROM provider_transactions r WHERE r.payment_intent_id=t.payment_intent_id AND r.kind='refund' AND r.related_external_transaction_id=t.external_transaction_id),0)::text refunded_minor
    FROM provider_transactions t WHERE t.payment_intent_id=ANY($1::uuid[]) AND t.kind='capture' ORDER BY t.occurred_at,t.id`,[intents.map(p=>p.id)])).rows;
   for(const intent of intents){
    const rows=captures.filter(r=>r.payment_intent_id===intent.id);
    if(intent.currency!==booking.currency||rows.reduce((n,r)=>n+BigInt(r.captured_minor),0n)!==BigInt(intent.captured_minor)||rows.reduce((n,r)=>n+BigInt(r.refunded_minor),0n)!==BigInt(intent.refunded_minor))throw new ConflictException('CANCELLATION_RECONCILIATION_REQUIRED');
   }
   const allocation=allocateCancellation(total,calculation.refundMinor,captures.map(r=>({id:r.id,paymentIntentId:r.payment_intent_id,capturedMinor:BigInt(r.captured_minor),refundedMinor:BigInt(r.refunded_minor)}))),cancellationId=randomUUID();
   await c.query(`INSERT INTO booking_cancellations(id,organization_id,property_id,reservation_id,currency,requested_at,policy_snapshot,price_total_minor,penalty_minor,net_collected_minor,refund_minor,idempotency_key,actor_user_id,actor_membership_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[cancellationId,actor.organizationId,booking.property_id,id,booking.currency,requestedAt,booking.cancellation_policy_snapshot,total.toString(),allocation.penaltyMinor.toString(),allocation.netCollectedMinor.toString(),allocation.refundMinor.toString(),commandKey,actor.userId,actor.membershipId]);
   for(const limit of allocation.limits)await c.query(`INSERT INTO cancellation_capture_limits(organization_id,cancellation_id,provider_transaction_id,refund_limit_minor,reclassification_minor) VALUES($1,$2,$3,$4,$5)`,[actor.organizationId,cancellationId,limit.id,limit.refundLimitMinor.toString(),limit.reclassificationMinor.toString()]);
   await c.query("DELETE FROM inventory_periods WHERE reservation_id=$1 AND kind='reservation'",[id]);
   await c.query("UPDATE reservations SET status='cancelled',cancelled_at=$2,updated_at=now(),version=version+1 WHERE id=$1",[id,requestedAt]);
   for(const intent of intents)await this.recovery.ensureRefundsForIntent(c,{organizationId:actor.organizationId,paymentIntentId:intent.id,provider:intent.provider,currency:intent.currency,reservationId:id});
   const result={cancellationId,reservationId:id,refundMinor:allocation.refundMinor.toString(),penaltyMinor:allocation.penaltyMinor.toString(),idempotentReplay:false};
   await c.query(`INSERT INTO booking_state_events(organization_id,reservation_id,event_type,from_status,to_status,actor_user_id,idempotency_key,payload) VALUES($1,$2,'booking.policy_cancelled','confirmed','cancelled',$3,$4,$5)`,[actor.organizationId,id,actor.userId,commandKey,result]);
   await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,request_id,action,entity_type,entity_id,after_state) VALUES($1,$2,$3,$4,'booking.policy_cancelled','reservation',$5,$6)`,[actor.organizationId,actor.userId,actor.membershipId,actor.requestId,id,result]);
   await c.query(`INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES($1,'reservation',$2,'booking.cancelled',$3,$4)`,[actor.organizationId,id,'policy-cancel:'+cancellationId,result]);
   return result;
  });
 }
}
