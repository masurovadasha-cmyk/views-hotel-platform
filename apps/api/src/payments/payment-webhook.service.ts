import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import {LedgerService} from "./ledger.service";
import {PaymentProviderRegistry} from "./payment-provider.registry";
import type {SupportedPaymentProvider,VerifiedWebhookEvent} from "./payment-provider.port";

@Injectable()
export class PaymentWebhookService{
  constructor(
    private readonly db:DatabaseService,
    private readonly providers:PaymentProviderRegistry,
    private readonly ledger:LedgerService
  ){}

  async processRaw(provider:SupportedPaymentProvider,rawBody:string,headers:Record<string,string|undefined>){
    const adapter=this.providers.get(provider);
    const event=await adapter.verifyAndParseWebhook(rawBody,headers);
    if(event.amountMinor<=0n)throw new Error("INVALID_PROVIDER_AMOUNT");
    return this.processVerified(provider,event,rawBody);
  }

  async processVerified(provider:SupportedPaymentProvider,event:VerifiedWebhookEvent,rawBody:string){
    return this.db.withOrganization(event.organizationId,async client=>{
      const inbox=await client.query<{id:string}>(
        `INSERT INTO payment_webhook_inbox(id,provider,external_event_id,event_type,payload,signature_metadata)
         VALUES(gen_random_uuid(),$1,$2,$3,$4::jsonb,'{}'::jsonb)
         ON CONFLICT(provider,external_event_id) DO NOTHING
         RETURNING id`,
        [provider,event.externalEventId,event.eventType,JSON.stringify({rawBody})]
      );
      if(!inbox.rowCount)return {status:"duplicate" as const};

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
      if(intent.provider!==provider)throw new Error("PAYMENT_PROVIDER_MISMATCH");
      if(intent.currency!==event.currency)throw new Error("PAYMENT_CURRENCY_MISMATCH");

      if(event.eventType==="authorized"){
        await this.insertProviderTransaction(client,intent.organization_id,intent.id,provider,event,"authorization");
        await client.query(
          `UPDATE payment_intents SET status='authorized',updated_at=now(),version=version+1 WHERE id=$1`,
          [intent.id]
        );
        await this.markWebhookProcessed(client,provider,event.externalEventId);
        return {status:"authorized" as const};
      }

      if(event.eventType==="captured"){
        const txInserted=await this.insertProviderTransaction(client,intent.organization_id,intent.id,provider,event,"capture");
        if(!txInserted){
          await this.markWebhookProcessed(client,provider,event.externalEventId);
          return {status:"duplicate_transaction" as const};
        }

        const currentCaptured=BigInt(intent.captured_minor);
        const target=BigInt(intent.amount_minor);
        const nextCaptured=currentCaptured+event.amountMinor;
        if(nextCaptured>target)throw new Error("CAPTURE_EXCEEDS_PAYMENT_INTENT");

        await this.ledger.postCapture(client,{
          organizationId:intent.organization_id,
          paymentIntentId:intent.id,
          amountMinor:event.amountMinor,
          currency:intent.currency,
          idempotencyKey:`capture:${provider}:${event.externalTransactionId}`
        });

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
          if(reservation.status==="hold"){
            await client.query("DELETE FROM inventory_periods WHERE reservation_id=$1 AND kind='payment_hold'",[intent.reservation_id]);
            await client.query(
              "UPDATE reservations SET status='cancelled',cancelled_at=now(),hold_expires_at=NULL,updated_at=now(),version=version+1 WHERE id=$1",
              [intent.reservation_id]
            );
          }
          await client.query(
            `UPDATE payment_intents
                SET captured_minor=$1,status='refund_pending',updated_at=now(),version=version+1
              WHERE id=$2`,
            [nextCaptured.toString(),intent.id]
          );
          await client.query(
            `INSERT INTO payment_refund_requests(
               id,organization_id,payment_intent_id,provider,amount_minor,currency,reason,idempotency_key,external_capture_id
             ) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,'late_capture_after_hold_expiry',$6,$7)
             ON CONFLICT(organization_id,idempotency_key) DO NOTHING`,
            [
              intent.organization_id,intent.id,provider,event.amountMinor.toString(),intent.currency,
              `late-capture:${provider}:${event.externalTransactionId}`,event.externalTransactionId
            ]
          );
          await client.query(
            `INSERT INTO outbox_events(id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
             VALUES(gen_random_uuid(),$1,'payment_intent',$2,'payment.refund_required',$3,$4::jsonb)
             ON CONFLICT(idempotency_key) DO NOTHING`,
            [
              intent.organization_id,intent.id,
              `outbox:refund-required:${provider}:${event.externalTransactionId}`,
              JSON.stringify({paymentIntentId:intent.id,reservationId:intent.reservation_id,reason:"late_capture_after_hold_expiry"})
            ]
          );
          await this.markWebhookProcessed(client,provider,event.externalEventId);
          return {status:"refund_pending" as const};
        }

        const nextStatus=nextCaptured===target?"captured":"partially_captured";
        await client.query(
          `UPDATE payment_intents
              SET captured_minor=$1,status=$2,updated_at=now(),version=version+1
            WHERE id=$3`,
          [nextCaptured.toString(),nextStatus,intent.id]
        );

        if(nextCaptured===target&&reservation.status==="hold"){
          await client.query(
            "UPDATE reservations SET status='confirmed',confirmed_at=now(),hold_expires_at=NULL,updated_at=now(),version=version+1 WHERE id=$1",
            [intent.reservation_id]
          );
          await client.query(
            "UPDATE inventory_periods SET kind='reservation',expires_at=NULL WHERE reservation_id=$1 AND kind='payment_hold'",
            [intent.reservation_id]
          );
          const eventKey=`payment-confirm:${provider}:${event.externalTransactionId}`;
          await client.query(
            `INSERT INTO booking_state_events(
               id,organization_id,reservation_id,event_type,from_status,to_status,idempotency_key,payload
             ) VALUES(gen_random_uuid(),$1,$2,'booking.confirmed_by_payment','hold','confirmed',$3,$4::jsonb)
             ON CONFLICT DO NOTHING`,
            [intent.organization_id,intent.reservation_id,eventKey,JSON.stringify({paymentIntentId:intent.id})]
          );
          await client.query(
            `INSERT INTO outbox_events(id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
             VALUES(gen_random_uuid(),$1,'reservation',$2,'booking.confirmed',$3,$4::jsonb)
             ON CONFLICT(idempotency_key) DO NOTHING`,
            [
              intent.organization_id,intent.reservation_id,`outbox:${eventKey}`,
              JSON.stringify({reservationId:intent.reservation_id,paymentIntentId:intent.id})
            ]
          );
        }

        await this.markWebhookProcessed(client,provider,event.externalEventId);
        return {status:nextStatus as "partially_captured"|"captured"};
      }

      if(event.eventType==="refunded"){
        const txInserted=await this.insertProviderTransaction(client,intent.organization_id,intent.id,provider,event,"refund");
        if(!txInserted){
          await this.markWebhookProcessed(client,provider,event.externalEventId);
          return {status:"duplicate_transaction" as const};
        }

        const captured=BigInt(intent.captured_minor);
        const refunded=BigInt(intent.refunded_minor);
        const nextRefunded=refunded+event.amountMinor;
        if(nextRefunded>captured)throw new Error("REFUND_EXCEEDS_CAPTURED");

        await this.ledger.postRefund(client,{
          organizationId:intent.organization_id,
          paymentIntentId:intent.id,
          amountMinor:event.amountMinor,
          currency:intent.currency,
          idempotencyKey:`refund:${provider}:${event.externalTransactionId}`
        });
        await client.query(
          `UPDATE payment_intents
              SET refunded_minor=$1,status=$2,updated_at=now(),version=version+1
            WHERE id=$3`,
          [nextRefunded.toString(),nextRefunded===captured?"refunded":"partially_refunded",intent.id]
        );
        await client.query(
          `UPDATE payment_refund_requests
              SET status='completed',external_refund_id=$1,completed_at=now(),last_error=NULL
            WHERE payment_intent_id=$2 AND status='pending' AND amount_minor=$3`,
          [event.externalTransactionId,intent.id,event.amountMinor.toString()]
        );
        await this.markWebhookProcessed(client,provider,event.externalEventId);
        return {status:nextRefunded===captured?"refunded" as const:"partially_refunded" as const};
      }

      if(event.eventType==="failed"||event.eventType==="cancelled"){
        if(BigInt(intent.captured_minor)===0n){
          await client.query(
            "UPDATE payment_intents SET status=$1,updated_at=now(),version=version+1 WHERE id=$2",
            [event.eventType==="failed"?"failed":"cancelled",intent.id]
          );
        }
        await this.markWebhookProcessed(client,provider,event.externalEventId);
        return {status:event.eventType};
      }

      throw new Error("UNSUPPORTED_PAYMENT_EVENT");
    });
  }

  private async insertProviderTransaction(
    client:any,organizationId:string,paymentIntentId:string,provider:string,
    event:VerifiedWebhookEvent,kind:"authorization"|"capture"|"refund"|"void"
  ){
    const result=await client.query(
      `INSERT INTO provider_transactions(
         id,organization_id,payment_intent_id,provider,external_transaction_id,related_external_transaction_id,kind,
         amount_minor,currency,occurred_at,raw_metadata
       ) VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       ON CONFLICT(provider,external_transaction_id,kind) DO NOTHING
       RETURNING id`,
      [
        organizationId,paymentIntentId,provider,event.externalTransactionId,event.relatedExternalTransactionId??null,kind,
        event.amountMinor.toString(),event.currency,event.occurredAt,JSON.stringify(event.rawMetadata)
      ]
    );
    return Boolean(result.rowCount);
  }

  private async markWebhookProcessed(client:any,provider:string,eventId:string){
    await client.query(
      "UPDATE payment_webhook_inbox SET processed_at=now(),processing_error=NULL WHERE provider=$1 AND external_event_id=$2",
      [provider,eventId]
    );
  }
}
