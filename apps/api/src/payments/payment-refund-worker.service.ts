import {randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import {PaymentProviderRegistry} from "./payment-provider.registry";
import type {SupportedPaymentProvider} from "./payment-provider.port";

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
    private readonly providers:PaymentProviderRegistry
  ){}

  async processTenantBatch(organizationId:string,limit=20){
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("INVALID_REFUND_BATCH_LIMIT");
    const workerId=randomUUID();

    const claimed=await this.db.withOrganization(organizationId,async client=>{
      const rows=await client.query<ClaimedRefund>(
        `WITH candidates AS (
           SELECT id
             FROM payment_refund_requests
            WHERE organization_id=$1
              AND next_attempt_at<=now()
              AND (
                status='pending'
                OR (status='processing' AND (lease_until IS NULL OR lease_until<now()))
              )
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

    let submitted=0,failed=0;
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

        await this.db.withOrganization(organizationId,async client=>{
          await client.query(
            `UPDATE payment_refund_requests
                SET status='submitted',external_refund_id=$1,lease_until=NULL,locked_by=NULL,last_error=NULL
              WHERE id=$2 AND locked_by=$3`,
            [result.externalRefundId,request.id,workerId]
          );
        });
        submitted++;
      }catch(error){
        const retrySeconds=Math.min(3600,30*Math.pow(2,Math.min(request.attempt_count,6)));
        await this.db.withOrganization(organizationId,async client=>{
          await client.query(
            `UPDATE payment_refund_requests
                SET status='pending',
                    next_attempt_at=now()+make_interval(secs=>$1),
                    lease_until=NULL,
                    locked_by=NULL,
                    last_error=$2
              WHERE id=$3 AND locked_by=$4`,
            [
              Math.floor(retrySeconds),
              (error instanceof Error?error.message:"refund_error").slice(0,1000),
              request.id,workerId
            ]
          );
        });
        failed++;
      }
    }
    return {claimed:claimed.length,submitted,failed};
  }
}
