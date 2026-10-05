import {Injectable} from "@nestjs/common";
import type {PoolClient} from "pg";
import {DatabaseService} from "../database/database.service";
import {LedgerService} from "./ledger.service";
import {publishPaymentProjection} from "./finance-projection-outbox";

type RecoverableIntent={
  id:string;
  reservation_id:string;
  provider:string;
  currency:string;
  status:string;
  reservation_status:string;
  hold_expires_at:Date|null;
};

@Injectable()
export class PaymentRecoveryService{
  constructor(
    private readonly db:DatabaseService,
    private readonly ledger:LedgerService
  ){}

  async reconcileTenant(organizationId:string,limit=50){
    if(!Number.isInteger(limit)||limit<1||limit>200)throw new Error("INVALID_PAYMENT_RECOVERY_LIMIT");

    return this.db.withOrganization(organizationId,async client=>{
      const rows=await client.query<RecoverableIntent>(
        `SELECT pi.id,pi.reservation_id,pi.provider,pi.currency,pi.status,
                r.status AS reservation_status,r.hold_expires_at
           FROM payment_intents pi
           JOIN reservations r ON r.id=pi.reservation_id
          WHERE pi.organization_id=$1
            AND pi.captured_minor>pi.refunded_minor
            AND pi.status IN ('partially_captured','captured','refund_pending')
            AND (
              r.status='cancelled'
              OR (r.status='hold' AND (r.hold_expires_at IS NULL OR r.hold_expires_at<=now()))
            )
          ORDER BY pi.created_at
          FOR UPDATE OF pi,r SKIP LOCKED
          LIMIT $2`,
        [organizationId,limit]
      );

      let refundsQueued=0,reclassified=0,cancelledReservations=0;

      for(const intent of rows.rows){
        if(intent.reservation_status==="hold"){
          await client.query(
            "DELETE FROM inventory_periods WHERE reservation_id=$1 AND kind='payment_hold'",
            [intent.reservation_id]
          );
          await client.query(
            `UPDATE reservations
                SET status='cancelled',cancelled_at=COALESCE(cancelled_at,now()),
                    hold_expires_at=NULL,updated_at=now(),version=version+1
              WHERE id=$1 AND status='hold'`,
            [intent.reservation_id]
          );
          cancelledReservations++;

          const eventKey="payment-recovery-expire:"+intent.reservation_id;
          await client.query(
            `INSERT INTO booking_state_events(
               id,organization_id,reservation_id,event_type,from_status,to_status,idempotency_key,payload
             )
             VALUES(gen_random_uuid(),$1,$2,'booking.hold_expired_with_payment','hold','cancelled',$3,'{}'::jsonb)
             ON CONFLICT DO NOTHING`,
            [organizationId,intent.reservation_id,eventKey]
          );
          await client.query(
            `INSERT INTO outbox_events(
               id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
             )
             VALUES(gen_random_uuid(),$1,'reservation',$2,'booking.cancelled',$3,$4::jsonb)
             ON CONFLICT(idempotency_key) DO NOTHING`,
            [
              organizationId,intent.reservation_id,"outbox:"+eventKey,
              JSON.stringify({reservationId:intent.reservation_id,reason:"payment_hold_expired"})
            ]
          );
        }

        await client.query(
          `UPDATE payment_intents
              SET status='refund_pending',updated_at=now(),version=version+1
            WHERE id=$1 AND status<>'refunded'`,
          [intent.id]
        );
        await publishPaymentProjection(client,organizationId,intent.id);

        const ensured=await this.ensureRefundsForIntent(client,{
          organizationId,
          paymentIntentId:intent.id,
          provider:intent.provider,
          currency:intent.currency,
          reservationId:intent.reservation_id
        });
        refundsQueued+=ensured.refundsQueued;
        reclassified+=ensured.reclassified;
      }

      return {intents:rows.rowCount??0,refundsQueued,reclassified,cancelledReservations};
    });
  }

  async ensureRefundsForIntent(
    client:PoolClient,
    input:{
      organizationId:string;
      paymentIntentId:string;
      provider:string;
      currency:string;
      reservationId:string;
    }
  ){
    const captures=await client.query<{
      external_transaction_id:string;
      captured_minor:string;
      refunded_minor:string;
    }>(
      `SELECT c.external_transaction_id,
              c.amount_minor::text AS captured_minor,
              COALESCE((
                SELECT sum(r.amount_minor)
                  FROM provider_transactions r
                 WHERE r.payment_intent_id=c.payment_intent_id
                   AND r.kind='refund'
                   AND r.related_external_transaction_id=c.external_transaction_id
              ),0)::text AS refunded_minor
         FROM provider_transactions c
        WHERE c.payment_intent_id=$1 AND c.kind='capture'
        ORDER BY c.occurred_at,c.id`,
      [input.paymentIntentId]
    );

    let refundsQueued=0,reclassified=0;

    for(const capture of captures.rows){
      const captured=BigInt(capture.captured_minor);
      const refunded=BigInt(capture.refunded_minor);
      const outstanding=captured-refunded;
      if(outstanding<=0n)continue;

      const lateJournalKey=`late-capture:${input.provider}:${capture.external_transaction_id}`;
      const lateJournal=await client.query<{id:string}>(
        `SELECT id FROM ledger_journals
          WHERE organization_id=$1 AND idempotency_key=$2`,
        [input.organizationId,lateJournalKey]
      );

      if(!lateJournal.rows[0]){
        await this.ledger.postRefundReclassification(client,{
          organizationId:input.organizationId,
          paymentIntentId:input.paymentIntentId,
          amountMinor:captured,
          currency:input.currency,
          idempotencyKey:`refund-reclassify:${input.provider}:${capture.external_transaction_id}`
        });
        reclassified++;
      }

      const refundKey=`refund-required:${input.provider}:${capture.external_transaction_id}:${refunded.toString()}`;
      const inserted=await client.query<{id:string}>(
        `INSERT INTO payment_refund_requests(
           id,organization_id,payment_intent_id,provider,amount_minor,currency,reason,
           liability_account_code,idempotency_key,external_capture_id
         )
         VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,'booking_unavailable_after_capture',
                'refunds_payable',$6,$7)
         ON CONFLICT(organization_id,idempotency_key) DO NOTHING
         RETURNING id`,
        [
          input.organizationId,input.paymentIntentId,input.provider,outstanding.toString(),
          input.currency,refundKey,capture.external_transaction_id
        ]
      );

      if(inserted.rowCount){
        refundsQueued++;
        await client.query(
          `INSERT INTO outbox_events(
             id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
           )
           VALUES(gen_random_uuid(),$1,'payment_intent',$2,'payment.refund_required',$3,$4::jsonb)
           ON CONFLICT(idempotency_key) DO NOTHING`,
          [
            input.organizationId,input.paymentIntentId,"outbox:"+refundKey,
            JSON.stringify({
              paymentIntentId:input.paymentIntentId,
              reservationId:input.reservationId,
              provider:input.provider,
              externalCaptureId:capture.external_transaction_id,
              amountMinor:outstanding.toString(),
              currency:input.currency,
              reason:"booking_unavailable_after_capture"
            })
          ]
        );
      }
    }

    return {refundsQueued,reclassified};
  }
}
