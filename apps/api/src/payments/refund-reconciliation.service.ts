import {ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {DatabaseService} from '../database/database.service';
import type {RequestActorContext} from '../identity/actor-context';
import {queueQuery,reconciliationId,reviewInput,type RefundState} from './refund-reconciliation.input';

type RefundRow={id:string;propertyId:string;reservationId:string;paymentIntentId:string;provider:string;
 amountMinor:string;currency:string;status:RefundState;externalCaptureId:string;externalRefundId:string|null;
 attemptCount:number;leaseUntil:Date|null;completedAt:Date|null;createdAt:Date;lastError:string|null;lockedBy:string|null};
const source=`FROM payment_refund_requests q
 JOIN payment_intents pi ON pi.id=q.payment_intent_id AND pi.organization_id=q.organization_id
 JOIN reservations r ON r.id=pi.reservation_id AND r.organization_id=pi.organization_id`;
const columns=`q.id,r.property_id AS "propertyId",r.id AS "reservationId",pi.id AS "paymentIntentId",q.provider,
 q.amount_minor::text AS "amountMinor",q.currency,q.status,q.external_capture_id AS "externalCaptureId",
 q.external_refund_id AS "externalRefundId",q.attempt_count AS "attemptCount",q.lease_until AS "leaseUntil",
 q.completed_at AS "completedAt",q.created_at AS "createdAt",q.last_error AS "lastError",q.locked_by AS "lockedBy"`;
function projection(row:RefundRow){
 // Opaque revision binds all delivery fields; provider messages/worker IDs are not exposed.
 const revision=createHash('sha256').update(JSON.stringify(row)).digest('hex');
 const {lastError,lockedBy,...safe}=row;
 const diagnostic=['REFUND_PROVIDER_NOT_CONNECTED','REFUND_NOT_SENT','REFUND_DELIVERY_UNCERTAIN_RECONCILE','REFUND_LEASE_EXPIRED_RECONCILE'].includes(lastError??'')?lastError:null;
 return {...safe,revision,diagnostic};
}
@Injectable()
export class RefundReconciliationService{
 constructor(private readonly db:DatabaseService){}
 async list(actor:RequestActorContext,input:{propertyId?:unknown;status?:unknown;cursor?:unknown}){
  const q=queueQuery(input);
  return this.db.withActor(actor,async c=>{
   await this.scope(c,actor,q.propertyId,'finance.read');
   const rows=(await c.query<RefundRow>(`SELECT ${columns} ${source}
    WHERE q.organization_id=$1 AND r.property_id=$2 AND ($3::uuid IS NULL OR q.id>$3)
     AND (($4='attention' AND (q.status IN ('uncertain','blocked','submitted') OR
      (q.status='processing' AND (q.lease_until IS NULL OR q.lease_until<now())))) OR q.status=$4)
    ORDER BY q.id LIMIT 51`,[actor.organizationId,q.propertyId,q.after,q.status])).rows;
   const items=rows.slice(0,50).map(projection),last=items.at(-1);
   return {items,nextCursor:rows.length>50&&last?Buffer.from(JSON.stringify([q.digest,last.id])).toString('base64url'):null};
  });
 }
 async detail(actor:RequestActorContext,requestId:string){
  const id=reconciliationId(requestId);
  return this.db.withActor(actor,async c=>{
   const row=await this.row(c,actor,id);
   const reviews=(await c.query(`SELECT id,action,case_reference AS "caseReference",observed_status AS "observedStatus",
    actor_user_id AS "actorUserId",created_at AS "createdAt" FROM payment_refund_reviews
    WHERE refund_request_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,[id])).rows;
   return {...projection(row),reviews};
  });
 }
 async review(actor:RequestActorContext,requestId:string,key:string,body:unknown){
  const id=reconciliationId(requestId),commandKey=reconciliationId(key),input=reviewInput(body);
  return this.db.withActor(actor,async c=>{
   const initial=await this.row(c,actor,id);
   await this.scope(c,actor,initial.propertyId,'finance.manage');
   await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['refund-review:'+actor.organizationId+':'+commandKey]);
   const prior=(await c.query(`SELECT id,refund_request_id,actor_user_id,actor_membership_id,expected_revision,action,case_reference
    FROM payment_refund_reviews WHERE organization_id=$1 AND idempotency_key=$2`,[actor.organizationId,commandKey])).rows[0];
   if(prior){
    if(prior.refund_request_id!==id||prior.actor_user_id!==actor.userId||prior.actor_membership_id!==actor.membershipId||
     prior.expected_revision!==input.expectedRevision||prior.action!==input.action||prior.case_reference!==input.caseReference)throw new ConflictException('REFUND_REVIEW_IDEMPOTENCY_CONFLICT');
    return {reviewId:prior.id as string,refundRequestId:id,idempotentReplay:true};
   }
   const current=await this.row(c,actor,id,true);
   if(projection(current).revision!==input.expectedRevision)throw new ConflictException('REFUND_REVIEW_STALE');
   const reviewId=randomUUID();
   await c.query(`INSERT INTO payment_refund_reviews(id,organization_id,property_id,refund_request_id,actor_user_id,actor_membership_id,
    idempotency_key,expected_revision,observed_status,action,case_reference) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [reviewId,actor.organizationId,current.propertyId,id,actor.userId,actor.membershipId,commandKey,input.expectedRevision,current.status,input.action,input.caseReference]);
   const payload={reviewId,refundRequestId:id,propertyId:current.propertyId,action:input.action,observedStatus:current.status};
   await c.query(`INSERT INTO audit_log(organization_id,actor_user_id,actor_membership_id,request_id,action,entity_type,entity_id,after_state)
    VALUES($1,$2,$3,$4,'payment.refund_reviewed','payment_refund_request',$5,$6)`,[actor.organizationId,actor.userId,actor.membershipId,actor.requestId,id,payload]);
   await c.query(`INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
    VALUES($1,'payment_refund_request',$2,'payment.refund_reviewed',$3,$4)`,[actor.organizationId,id,'refund-review:'+reviewId,payload]);
   return {reviewId,refundRequestId:id,idempotentReplay:false};
  });
 }
 private async row(c:PoolClient,actor:RequestActorContext,id:string,lock=false){
  const row=(await c.query<RefundRow>(`SELECT ${columns} ${source} WHERE q.id=$1 AND q.organization_id=$2
   AND app.registry_access(q.organization_id,r.property_id,'finance.read') ${lock?'FOR UPDATE OF q':''}`,[id,actor.organizationId])).rows[0];
  if(!row)throw new NotFoundException('REFUND_REQUEST_NOT_FOUND');
  return row;
 }
 private async scope(c:PoolClient,actor:RequestActorContext,propertyId:string,permission:string){
  await c.query("SET LOCAL statement_timeout='5s'");
  if(!(await c.query('SELECT app.registry_access($1,$2,$3) allowed',[actor.organizationId,propertyId,permission])).rows[0]?.allowed)throw new ForbiddenException('PROPERTY_FORBIDDEN');
 }
}
