import {randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import {PaymentProviderNotConnectedError,PaymentProviderRegistry} from "./payment-provider.registry";
import {PaymentRecoveryService} from "./payment-recovery.service";
import {RefundNotSentError,type SupportedPaymentProvider} from "./payment-provider.port";

type ClaimedRefund={
  id:string;
  payment_intent_id:string;
  provider:SupportedPaymentProvider;
  amount_minor:string;
  currency:string;
  idempotency_key:string;
  external_capture_id:string;
  attempt_count:number;
};

@Injectable()
export class PaymentRefundWorkerService{
  constructor(
    private readonly db:DatabaseService,
    private readonly providers:PaymentProviderRegistry,
    private readonly recovery:PaymentRecoveryService
  ){}

  async processTenantBatch(organizationId:string,limit=20){
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("INVALID_REFUND_BATCH_LIMIT");
    const workerId=randomUUID();
    await this.recovery.reconcileTenant(organizationId,Math.min(limit*2,200));

    const claimed=await this.db.withOrganization(organizationId,async client=>{
      // An expired lease may have sent money before its worker crashed. It must
      // be reconciled, never automatically claimed for another financial send.
      await client.query(`UPDATE payment_refund_requests SET status='uncertain',lease_until=NULL,locked_by=NULL,last_error='REFUND_LEASE_EXPIRED_RECONCILE'
        WHERE organization_id=$1 AND status='processing' AND (lease_until IS NULL OR lease_until<now())`,[organizationId]);
      const rows=await client.query<ClaimedRefund>(
        `WITH candidates AS (
           SELECT id
             FROM payment_refund_requests
            WHERE organization_id=$1
              AND next_attempt_at<=now()
              AND status='pending'
            ORDER BY created_at
            FOR UPDATE SKIP LOCKED
            LIMIT $2
         )
         UPDATE payment_refund_requests r
            SET status='processing',
                lease_until=now()+interval '2 minutes',
                locked_by=$3,
                attempt_count=attempt_count+1
           FROM candidates c
          WHERE r.id=c.id
         RETURNING r.id,r.payment_intent_id,r.provider,r.amount_minor::text,r.currency,
                   r.idempotency_key,r.external_capture_id,r.attempt_count`,
        [organizationId,limit,workerId]
      );
      return rows.rows;
    });

    let submitted=0,failed=0,uncertain=0,blocked=0,superseded=0;
    for(const request of claimed){
      try{
        const adapter=this.providers.get(request.provider);
        const result=await adapter.refund({
          paymentIntentId:request.payment_intent_id,
          externalCaptureId:request.external_capture_id,
          amountMinor:BigInt(request.amount_minor),
          currency:request.currency,
          idempotencyKey:request.idempotency_key
        });

        if(!result||!['pending','refunded'].includes(result.status)||typeof result.externalRefundId!=='string'||!result.externalRefundId.trim()||result.externalRefundId.length>200)throw Error('INVALID_REFUND_RESPONSE');
        const saved=await this.db.withOrganization(organizationId,async client=>{
          return client.query(
            `UPDATE payment_refund_requests
                SET status='submitted',external_refund_id=$1,lease_until=NULL,locked_by=NULL,last_error=NULL
              WHERE id=$2 AND locked_by=$3 AND status='processing'`,
            [result.externalRefundId,request.id,workerId]
          );
        });
        if(saved.rowCount)submitted++;else superseded++;
      }catch(error){
        const status=error instanceof PaymentProviderNotConnectedError?'blocked':error instanceof RefundNotSentError?'pending':'uncertain';
        const diagnostic=status==='blocked'?'REFUND_PROVIDER_NOT_CONNECTED':status==='pending'?'REFUND_NOT_SENT':'REFUND_DELIVERY_UNCERTAIN_RECONCILE';
        const retrySeconds=Math.min(3600,30*Math.pow(2,Math.min(request.attempt_count,6)));
        const saved=await this.db.withOrganization(organizationId,client=>client.query(
          `UPDATE payment_refund_requests SET status=$1,next_attempt_at=now()+make_interval(secs=>$2),lease_until=NULL,locked_by=NULL,last_error=$3
           WHERE id=$4 AND locked_by=$5 AND status='processing'`,[status,Math.floor(retrySeconds),diagnostic,request.id,workerId]));
        if(!saved.rowCount)superseded++;
        else if(status==='uncertain')uncertain++;else if(status==='blocked')blocked++;else failed++;
      }
    }
    return {claimed:claimed.length,submitted,failed,uncertain,blocked,superseded};
  }
}
