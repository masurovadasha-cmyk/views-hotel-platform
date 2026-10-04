import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {assertComplianceRole} from "./compliance-authorization";
import {ComplianceProviderRegistry} from "./provider.registry";

type FiscalizationPolicyConfig={provider:string};

@Injectable()
export class FiscalizationService{
  constructor(
    private readonly db:DatabaseService,
    private readonly providers:ComplianceProviderRegistry
  ){}

  async prepareFromProviderTransaction(actor:RequestActorContext,providerTransactionId:string){
    return this.db.withActor(actor,async client=>{
      await assertComplianceRole(client,actor.membershipId,["owner","manager","accountant"]);

      const txResult=await client.query<{
        id:string;organization_id:string;payment_intent_id:string;provider:string;external_transaction_id:string;
        kind:string;amount_minor:string;currency:string;occurred_at:Date;
        reservation_id:string;property_id:string;country_code:string;timezone:string;
      }>(
        `SELECT pt.id,pt.organization_id,pt.payment_intent_id,pt.provider,pt.external_transaction_id,
                pt.kind,pt.amount_minor::text,pt.currency,pt.occurred_at,
                pi.reservation_id,r.property_id,p.country_code,p.timezone
           FROM provider_transactions pt
           JOIN payment_intents pi ON pi.id=pt.payment_intent_id
           JOIN reservations r ON r.id=pi.reservation_id
           JOIN properties p ON p.id=r.property_id
          WHERE pt.id=$1`,
        [providerTransactionId]
      );
      const tx=txResult.rows[0];
      if(!tx)throw new Error("PROVIDER_TRANSACTION_NOT_FOUND");
      if(!["capture","refund"].includes(tx.kind))throw new Error("FISCALIZATION_UNSUPPORTED_TRANSACTION_KIND");

      const access=await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[tx.property_id]
      );
      if(!access.rows[0]?.allowed)throw new Error("PROPERTY_FORBIDDEN");

      const localDate=(await client.query<{local_date:string}>(
        "SELECT ($1::timestamptz AT TIME ZONE $2)::date::text AS local_date",
        [tx.occurred_at,tx.timezone]
      )).rows[0].local_date;

      const policyResult=await client.query<{
        id:string;version:number;config:FiscalizationPolicyConfig;legal_references:unknown;
      }>(
        `SELECT id,version,config,legal_references
           FROM compliance_policy_versions
          WHERE organization_id=$1
            AND country_code=$2
            AND code='fiscalization'
            AND active=true
            AND effective_from<=$3::date
            AND (effective_to IS NULL OR effective_to>=$3::date)
          ORDER BY version DESC
          LIMIT 1`,
        [actor.organizationId,tx.country_code,localDate]
      );
      const policy=policyResult.rows[0];
      if(!policy)throw new Error("FISCALIZATION_POLICY_NOT_CONFIGURED");
      if(!policy.config?.provider)throw new Error("INVALID_FISCALIZATION_POLICY");

      const journal=await client.query<{id:string}>(
        `SELECT id FROM ledger_journals
          WHERE organization_id=$1
            AND reference_type='payment_intent'
            AND reference_id=$2
            AND status='posted'
          ORDER BY posted_at DESC
          LIMIT 1`,
        [actor.organizationId,tx.payment_intent_id]
      );

      const receiptType=tx.kind==="capture"?"sale":"refund";
      const idempotencyKey=`fiscal:${tx.provider}:${tx.external_transaction_id}:${tx.kind}`;
      const payload={
        policy:{id:policy.id,version:policy.version,legalReferences:policy.legal_references},
        providerTransactionId:tx.id,paymentIntentId:tx.payment_intent_id,reservationId:tx.reservation_id,
        paymentProvider:tx.provider,externalTransactionId:tx.external_transaction_id,
        transactionKind:tx.kind,amountMinor:tx.amount_minor,currency:tx.currency,occurredAt:tx.occurred_at.toISOString()
      };

      const inserted=await client.query<{
        id:string;status:string;amount_minor:string;currency:string;provider:string;
      }>(
        `INSERT INTO fiscalization_requests(
           id,organization_id,reservation_id,payment_intent_id,provider_transaction_id,ledger_journal_id,
           provider,receipt_type,amount_minor,currency,status,idempotency_key,payload_snapshot
         ) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11::jsonb)
         ON CONFLICT(provider_transaction_id) DO NOTHING
         RETURNING id,status,amount_minor::text,currency,provider`,
        [
          actor.organizationId,tx.reservation_id,tx.payment_intent_id,tx.id,journal.rows[0]?.id??null,
          policy.config.provider,receiptType,tx.amount_minor,tx.currency,idempotencyKey,JSON.stringify(payload)
        ]
      );

      let row=inserted.rows[0];
      if(!row){
        row=(await client.query<{
          id:string;status:string;amount_minor:string;currency:string;provider:string;
        }>(
          `SELECT id,status,amount_minor::text,currency,provider
             FROM fiscalization_requests WHERE provider_transaction_id=$1`,
          [tx.id]
        )).rows[0];
      }else{
        await client.query(
          `INSERT INTO outbox_events(
             id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
           ) VALUES(gen_random_uuid(),$1,'fiscalization_request',$2,'compliance.fiscalization_prepared',$3,$4::jsonb)
           ON CONFLICT(idempotency_key) DO NOTHING`,
          [
            actor.organizationId,row.id,"outbox:"+idempotencyKey,
            JSON.stringify({fiscalizationRequestId:row.id,providerTransactionId:tx.id,receiptType})
          ]
        );
      }

      return {
        requestId:row.id,status:row.status,amountMinor:BigInt(row.amount_minor),
        currency:row.currency,provider:row.provider,idempotentReplay:!inserted.rowCount
      };
    });
  }

  async submitNow(actor:RequestActorContext,requestId:string){
    const claimed=await this.db.withActor(actor,async client=>{
      await assertComplianceRole(client,actor.membershipId,["owner","manager","accountant"]);

      const row=(await client.query<{
        id:string;provider:string;receipt_type:"sale"|"refund";amount_minor:string;currency:string;
        status:string;idempotency_key:string;payload_snapshot:Record<string,unknown>;attempt_count:number;
      }>(
        `SELECT id,provider,receipt_type,amount_minor::text,currency,status,idempotency_key,payload_snapshot,attempt_count
           FROM fiscalization_requests WHERE id=$1 FOR UPDATE`,
        [requestId]
      )).rows[0];
      if(!row)throw new Error("FISCALIZATION_REQUEST_NOT_FOUND");
      if(row.status==="confirmed"){
        return {alreadyConfirmed:true,requestId:row.id} as const;
      }
      if(!["pending","failed","submitted"].includes(row.status))throw new Error("FISCALIZATION_NOT_SUBMITTABLE");

      const leaseUntil=new Date(Date.now()+120000);
      const updated=await client.query(
        `UPDATE fiscalization_requests
            SET status='submitted',attempt_count=attempt_count+1,lease_until=$2,locked_by=$3,
                last_error=NULL,updated_at=now()
          WHERE id=$1 AND (lease_until IS NULL OR lease_until<now())
          RETURNING id`,
        [row.id,leaseUntil,actor.requestId]
      );
      if(!updated.rowCount)throw new Error("FISCALIZATION_REQUEST_BUSY");

      return {
        alreadyConfirmed:false as const,
        requestId:row.id,provider:row.provider,receiptType:row.receipt_type,
        amountMinor:BigInt(row.amount_minor),currency:row.currency,idempotencyKey:row.idempotency_key,
        payload:row.payload_snapshot,attempt:row.attempt_count+1
      };
    });

    if(claimed.alreadyConfirmed)return {requestId:claimed.requestId,status:"confirmed",idempotentReplay:true};

    try{
      const provider=this.providers.fiscalizationProvider(claimed.provider);
      const submission={
        idempotencyKey:claimed.idempotencyKey,requestId:claimed.requestId,
        receiptType:claimed.receiptType,amountMinor:claimed.amountMinor,
        currency:claimed.currency,payload:claimed.payload
      };
      const digest=createHash("sha256")
        .update(JSON.stringify(submission,(_,v)=>typeof v==="bigint"?v.toString():v))
        .digest("hex");
      const result=await provider.submit(submission);

      return this.db.withActor(actor,async client=>{
        await client.query(
          `UPDATE fiscalization_requests
              SET status=$2,external_receipt_id=$3,fiscal_sign=$4,receipt_url=$5,
                  submitted_at=COALESCE(submitted_at,now()),
                  confirmed_at=CASE WHEN $2='confirmed' THEN now() ELSE confirmed_at END,
                  lease_until=NULL,locked_by=NULL,last_error=NULL,updated_at=now()
            WHERE id=$1 AND locked_by=$6`,
          [
            claimed.requestId,result.status,result.externalReceiptId,result.fiscalSign??null,
            result.receiptUrl??null,actor.requestId
          ]
        );
        await client.query(
          `INSERT INTO fiscalization_attempts(
             id,fiscalization_request_id,request_digest,response_metadata,attempt_status
           ) VALUES(gen_random_uuid(),$1,$2,$3::jsonb,$4)`,
          [claimed.requestId,digest,JSON.stringify(result.responseMetadata??{}),result.status]
        );
        await client.query(
          `INSERT INTO outbox_events(
             id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
           ) VALUES(gen_random_uuid(),$1,'fiscalization_request',$2,$3,$4,$5::jsonb)
           ON CONFLICT(idempotency_key) DO NOTHING`,
          [
            actor.organizationId,claimed.requestId,
            result.status==="confirmed"?"compliance.fiscalization_confirmed":"compliance.fiscalization_submitted",
            "outbox:fiscalization:"+claimed.requestId+":"+result.externalReceiptId+":"+result.status,
            JSON.stringify({fiscalizationRequestId:claimed.requestId,externalReceiptId:result.externalReceiptId})
          ]
        );
        return {
          requestId:claimed.requestId,status:result.status,
          externalReceiptId:result.externalReceiptId,idempotentReplay:false
        };
      });
    }catch(error){
      const message=error instanceof Error?error.message:"FISCALIZATION_PROVIDER_ERROR";
      await this.db.withActor(actor,async client=>{
        const nextAttemptSeconds=Math.min(3600,30*Math.pow(2,Math.min(claimed.attempt,6)));
        await client.query(
          `UPDATE fiscalization_requests
              SET status='failed',last_error=$2,
                  next_attempt_at=now()+make_interval(secs=>$3),
                  lease_until=NULL,locked_by=NULL,updated_at=now()
            WHERE id=$1 AND locked_by=$4`,
          [claimed.requestId,message.slice(0,200),nextAttemptSeconds,actor.requestId]
        );
        await client.query(
          `INSERT INTO fiscalization_attempts(
             id,fiscalization_request_id,request_digest,response_metadata,attempt_status
           ) VALUES(gen_random_uuid(),$1,$2,'{}'::jsonb,'failed')`,
          [
            claimed.requestId,
            createHash("sha256").update(claimed.requestId+":"+claimed.attempt).digest("hex")
          ]
        );
      });
      throw error;
    }
  }
}
