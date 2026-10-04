import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";
import {LedgerService} from "./ledger.service";
import {PaymentProviderRegistry} from "./payment-provider.registry";
import {PaymentRecoveryService} from "./payment-recovery.service";
import type {SupportedPaymentProvider,VerifiedWebhookEvent} from "./payment-provider.port";

@Injectable()
export class PaymentWebhookService{
  constructor(
    private readonly db:DatabaseService,
    private readonly providers:PaymentProviderRegistry,
    private readonly ledger:LedgerService,
    private readonly recovery:PaymentRecoveryService
  ){}

  async processRaw(provider:SupportedPaymentProvider,rawBody:string,headers:Record<string,string|undefined>){
    const adapter=this.providers.get(provider);
    const event=await adapter.verifyAndParseWebhook(rawBody,headers);
    if(event.amountMinor<=0n)throw new Error("INVALID_PROVIDER_AMOUNT");
    return this.processVerified(provider,event,rawBody);
  }

  async processVerified(provider:SupportedPaymentProvider,event:VerifiedWebhookEvent,rawBody:string){
    if(event.amountMinor<=0n)throw new Error("INVALID_PROVIDER_AMOUNT");
    const payloadHash=createHash("sha256").update(rawBody).digest("hex");

    return this.db.withOrganization(event.organizationId,async client=>{
      const inbox=await client.query<{id:string}>(
        `INSERT INTO payment_webhook_inbox(
           id,organization_id,payment_intent_id,provider,external_event_id,event_type,payload_hash,payload,signature_metadata
         )
         VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7::jsonb,'{}'::jsonb)
         ON CONFLICT(provider,external_event_id) DO NOTHING
         RETURNING id`,
        [
          event.organizationId,event.paymentIntentId,provider,event.externalEventId,event.eventType,payloadHash,
          JSON.stringify({
            paymentIntentId:event.paymentIntentId,
            externalTransactionId:event.externalTransactionId,
            relatedExternalTransactionId:event.relatedExternalTransactionId??null,
            eventType:event.eventType,
            amountMinor:event.amountMinor.toString(),
            currency:event.currency,
            occurredAt:event.occurredAt,
            rawMetadata:event.rawMetadata
          })
        ]
      );

      if(!inbox.rowCount){
        const existing=await client.query<{payload_hash:string}>(
          `SELECT payload_hash FROM payment_webhook_inbox
            WHERE organization_id=$1 AND provider=$2 AND external_event_id=$3`,
          [event.organizationId,provider,event.externalEventId]
        );
        if(!existing.rows[0])throw new Error("WEBHOOK_EVENT_COLLISION");
        if(existing.rows[0].payload_hash!==payloadHash)throw new Error("WEBHOOK_EVENT_PAYLOAD_MISMATCH");
        return {status:"duplicate" as const};
      }

      const intentResult=await client.query<{
        id:string;organization_id:string;reservation_id:string;provider:string;status:string;
        amount_minor:string;currency:string;captured_minor:string;refunded_minor:string;
      }>(
        `SELECT id,organization_id,reservation_id,provider,status,amount_minor::text,currency,
                captured_minor::text,refunded_minor::text
           FROM payment_intents
          WHERE id=$1 FOR UPDATE`,
        [event.paymentIntentId]
      );
      const intent=intentResult.rows[0];
      if(!intent)throw new Error("PAYMENT_INTENT_NOT_FOUND");
      if(intent.organization_id!==event.organizationId)throw new Error("PAYMENT_TENANT_MISMATCH");
      if(intent.provider!==provider)throw new Error("PAYMENT_PROVIDER_MISMATCH");
      if(intent.currency!==event.currency)throw new Error("PAYMENT_CURRENCY_MISMATCH");

      if(event.eventType==="authorized"){
        const tx=await this.insertProviderTransaction(client,intent.organization_id,intent.id,provider,event,"authorization");
        if(!tx){
          await this.markWebhookProcessed(client,event.organizationId,provider,event.externalEventId,{status:"duplicate_transaction"});
          return {status:"duplicate_transaction" as const};
        }
        await client.query(
          `UPDATE payment_intents
              SET status='authorized',updated_at=now(),version=version+1
            WHERE id=$1 AND captured_minor=0`,
          [intent.id]
        );
        await this.markWebhookProcessed(client,event.organizationId,provider,event.externalEventId,{status:"authorized"});
        return {status:"authorized" as const};
      }

      if(event.eventType==="captured"){
        const providerTransactionId=await this.insertProviderTransaction(
          client,intent.organization_id,intent.id,provider,event,"capture"
        );
        if(!providerTransactionId){
          await this.markWebhookProcessed(client,event.organizationId,provider,event.externalEventId,{status:"duplicate_transaction"});
          return {status:"duplicate_transaction" as const};
        }

        const currentCaptured=BigInt(intent.captured_minor);
        const target=BigInt(intent.amount_minor);
        const nextCaptured=currentCaptured+event.amountMinor;
        if(nextCaptured>target)throw new Error("CAPTURE_EXCEEDS_PAYMENT_INTENT");

        const reservation=(await client.query<{
          status:string;hold_expires_at:Date|null;property_id:string;
        }>(
          "SELECT status,hold_expires_at,property_id FROM reservations WHERE id=$1 FOR UPDATE",
          [intent.reservation_id]
        )).rows[0];
        if(!reservation)throw new Error("RESERVATION_NOT_FOUND");

        const late=
          reservation.status==="cancelled"||
          (reservation.status==="hold"&&(!reservation.hold_expires_at||reservation.hold_expires_at.getTime()<=Date.now()));

        if(late){
          await this.ledger.postLateCapture(client,{
            organizationId:intent.organization_id,
            paymentIntentId:intent.id,
            amountMinor:event.amountMinor,
            currency:intent.currency,
            idempotencyKey:`late-capture:${provider}:${event.externalTransactionId}`
          });

          if(reservation.status==="hold"){
            await client.query(
              "DELETE FROM inventory_periods WHERE reservation_id=$1 AND kind='payment_hold'",
              [intent.reservation_id]
            );
            await client.query(
              `UPDATE reservations
                  SET status='cancelled',cancelled_at=now(),hold_expires_at=NULL,updated_at=now(),version=version+1
                WHERE id=$1`,
              [intent.reservation_id]
            );
          }

          await client.query(
            `UPDATE payment_intents
                SET captured_minor=$1,status='refund_pending',updated_at=now(),version=version+1
              WHERE id=$2`,
            [nextCaptured.toString(),intent.id]
          );
          await this.recovery.ensureRefundsForIntent(client,{
            organizationId:intent.organization_id,
            paymentIntentId:intent.id,
            provider,
            currency:intent.currency,
            reservationId:intent.reservation_id
          });
          await this.markWebhookProcessed(
            client,event.organizationId,provider,event.externalEventId,{status:"refund_pending"}
          );
          return {status:"refund_pending" as const};
        }

        await this.ledger.postCapture(client,{
          organizationId:intent.organization_id,
          paymentIntentId:intent.id,
          amountMinor:event.amountMinor,
          currency:intent.currency,
          idempotencyKey:`capture:${provider}:${event.externalTransactionId}`
        });

        await client.query(
          `INSERT INTO outbox_events(id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
           VALUES(gen_random_uuid(),$1,'provider_transaction',$2,'payment.captured',$3,$4::jsonb)
           ON CONFLICT(idempotency_key) DO NOTHING`,
          [
            intent.organization_id,providerTransactionId,
            `outbox:payment-captured:${provider}:${event.externalTransactionId}`,
            JSON.stringify({
              providerTransactionId,paymentIntentId:intent.id,reservationId:intent.reservation_id,
              provider,amountMinor:event.amountMinor.toString(),currency:intent.currency
            })
          ]
        );

        const nextStatus=nextCaptured===target?"captured":"partially_captured";
        await client.query(
          `UPDATE payment_intents
              SET captured_minor=$1,status=$2,updated_at=now(),version=version+1
            WHERE id=$3`,
          [nextCaptured.toString(),nextStatus,intent.id]
        );

        if(nextCaptured===target&&reservation.status==="hold"){
          await client.query(
            `UPDATE reservations
                SET status='confirmed',confirmed_at=now(),hold_expires_at=NULL,updated_at=now(),version=version+1
              WHERE id=$1`,
            [intent.reservation_id]
          );
          await client.query(
            `UPDATE inventory_periods
                SET kind='reservation',expires_at=NULL
              WHERE reservation_id=$1 AND kind='payment_hold'`,
            [intent.reservation_id]
          );
          const bookingEventKey=`payment-confirm:${provider}:${event.externalTransactionId}`;
          await client.query(
            `INSERT INTO booking_state_events(
               id,organization_id,reservation_id,event_type,from_status,to_status,idempotency_key,payload
             )
             VALUES(gen_random_uuid(),$1,$2,'booking.confirmed_by_payment','hold','confirmed',$3,$4::jsonb)
             ON CONFLICT DO NOTHING`,
            [
              intent.organization_id,intent.reservation_id,bookingEventKey,
              JSON.stringify({paymentIntentId:intent.id})
            ]
          );
          await client.query(
            `INSERT INTO outbox_events(
               id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
             )
             VALUES(gen_random_uuid(),$1,'reservation',$2,'booking.confirmed',$3,$4::jsonb)
             ON CONFLICT(idempotency_key) DO NOTHING`,
            [
              intent.organization_id,intent.reservation_id,`outbox:${bookingEventKey}`,
              JSON.stringify({reservationId:intent.reservation_id,paymentIntentId:intent.id})
            ]
          );
        }

        await this.markWebhookProcessed(
          client,event.organizationId,provider,event.externalEventId,{status:nextStatus}
        );
        return {status:nextStatus as "partially_captured"|"captured"};
      }

      if(event.eventType==="refunded"){
        const providerTransactionId=await this.insertProviderTransaction(
          client,intent.organization_id,intent.id,provider,event,"refund"
        );
        if(!providerTransactionId){
          await this.markWebhookProcessed(client,event.organizationId,provider,event.externalEventId,{status:"duplicate_transaction"});
          return {status:"duplicate_transaction" as const};
        }

        const captured=BigInt(intent.captured_minor);
        const refunded=BigInt(intent.refunded_minor);
        const nextRefunded=refunded+event.amountMinor;
        if(nextRefunded>captured)throw new Error("REFUND_EXCEEDS_CAPTURED");

        const refundRequest=await this.findRefundRequest(
          client,intent.id,event.relatedExternalTransactionId,event.externalTransactionId,event.amountMinor
        );
        const liabilityCode=refundRequest?.liability_account_code==="refunds_payable"
          ?"refunds_payable" as const
          :"guest_deposits" as const;

        await this.ledger.postRefund(client,{
          organizationId:intent.organization_id,
          paymentIntentId:intent.id,
          amountMinor:event.amountMinor,
          currency:intent.currency,
          idempotencyKey:`refund:${provider}:${event.externalTransactionId}`,
          liabilityCode
        });

        await client.query(
          `INSERT INTO outbox_events(id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
           VALUES(gen_random_uuid(),$1,'provider_transaction',$2,'payment.refunded',$3,$4::jsonb)
           ON CONFLICT(idempotency_key) DO NOTHING`,
          [
            intent.organization_id,providerTransactionId,
            `outbox:payment-refunded:${provider}:${event.externalTransactionId}`,
            JSON.stringify({
              providerTransactionId,paymentIntentId:intent.id,reservationId:intent.reservation_id,
              provider,amountMinor:event.amountMinor.toString(),currency:intent.currency
            })
          ]
        );
        const nextStatus=nextRefunded===captured?"refunded":"partially_refunded";
        await client.query(
          `UPDATE payment_intents
              SET refunded_minor=$1,status=$2,updated_at=now(),version=version+1
            WHERE id=$3`,
          [nextRefunded.toString(),nextStatus,intent.id]
        );

        if(refundRequest){
          await client.query(
            `UPDATE payment_refund_requests
                SET status='completed',external_refund_id=$1,completed_at=now(),last_error=NULL
              WHERE id=$2`,
            [event.externalTransactionId,refundRequest.id]
          );
        }

        await this.markWebhookProcessed(
          client,event.organizationId,provider,event.externalEventId,{status:nextStatus}
        );
        return {status:nextStatus as "refunded"|"partially_refunded"};
      }

      if(event.eventType==="failed"||event.eventType==="cancelled"){
        if(BigInt(intent.captured_minor)===0n){
          await client.query(
            `UPDATE payment_intents
                SET status=$1,updated_at=now(),version=version+1
              WHERE id=$2`,
            [event.eventType==="failed"?"failed":"cancelled",intent.id]
          );
        }
        await this.markWebhookProcessed(
          client,event.organizationId,provider,event.externalEventId,{status:event.eventType}
        );
        return {status:event.eventType};
      }

      throw new Error("UNSUPPORTED_PAYMENT_EVENT");
    });
  }

  private async insertProviderTransaction(
    client:PoolClient,organizationId:string,paymentIntentId:string,provider:string,
    event:VerifiedWebhookEvent,kind:"authorization"|"capture"|"refund"|"void"
  ){
    const result=await client.query<{id:string}>(
      `INSERT INTO provider_transactions(
         id,organization_id,payment_intent_id,provider,external_transaction_id,related_external_transaction_id,kind,
         amount_minor,currency,occurred_at,raw_metadata
       )
       VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT(provider,external_transaction_id,kind) DO NOTHING
       RETURNING id`,
      [
        organizationId,paymentIntentId,provider,event.externalTransactionId,event.relatedExternalTransactionId??null,kind,
        event.amountMinor.toString(),event.currency,event.occurredAt,JSON.stringify(event.rawMetadata)
      ]
    );
    return result.rows[0]?.id??null;
  }

  private async findRefundRequest(
    client:PoolClient,paymentIntentId:string,relatedCaptureId:string|undefined,
    externalRefundId:string,amountMinor:bigint
  ){
    const result=await client.query<{id:string;reason:string;liability_account_code:string}>(
      `SELECT id,reason,liability_account_code
         FROM payment_refund_requests
        WHERE payment_intent_id=$1
          AND amount_minor=$2
          AND status IN ('pending','processing','submitted')
          AND (
            ($3::text IS NOT NULL AND external_capture_id=$3)
            OR (external_refund_id IS NOT NULL AND external_refund_id=$4)
          )
        ORDER BY created_at
        LIMIT 1
        FOR UPDATE`,
      [paymentIntentId,amountMinor.toString(),relatedCaptureId??null,externalRefundId]
    );
    return result.rows[0]??null;
  }

  private async markWebhookProcessed(
    client:PoolClient,organizationId:string,provider:string,eventId:string,result:Record<string,unknown>
  ){
    await client.query(
      `UPDATE payment_webhook_inbox
          SET processed_at=now(),processing_error=NULL,result=$1::jsonb
        WHERE organization_id=$2 AND provider=$3 AND external_event_id=$4`,
      [JSON.stringify(result),organizationId,provider,eventId]
    );
  }
}
