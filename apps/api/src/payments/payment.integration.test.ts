import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {DatabaseService} from "../database/database.service";
import {BookingHoldService} from "../booking/booking-hold.service";
import {BookingLifecycleService} from "../booking/booking-lifecycle.service";
import {QuoteService} from "../rates/quote.service";
import {LedgerService} from "./ledger.service";
import {PaymentIntentService} from "./payment-intent.service";
import {PaymentProviderRegistry} from "./payment-provider.registry";
import {PaymentRecoveryService} from "./payment-recovery.service";
import type {
  HostedCheckoutRequest,HostedCheckoutResult,PaymentProviderPort,RefundRequest,RefundResult,VerifiedWebhookEvent
} from "./payment-provider.port";
import {PaymentRefundWorkerService} from "./payment-refund-worker.service";
import {PaymentWebhookService} from "./payment-webhook.service";

const ORG="00000000-0000-0000-0000-000000000001";
const PROPERTY="00000000-0000-0000-0000-000000000002";
const UNIT="00000000-0000-0000-0000-000000000004";
const RATE="00000000-0000-0000-0000-000000000008";
const POLICY="70000000-0000-4000-8000-000000000001";

const actor={
  organizationId:ORG,
  userId:"20000000-0000-4000-8000-000000000001",
  membershipId:"30000000-0000-4000-8000-000000000001",
  requestId:"payments-integration-test"
};

class TestPaymeProvider implements PaymentProviderPort{
  readonly provider="payme" as const;
  refundCalls:RefundRequest[]=[];

  async createHostedCheckout(input:HostedCheckoutRequest):Promise<HostedCheckoutResult>{
    return {
      providerAttemptRef:"attempt-"+input.paymentIntentId,
      checkoutUrl:"https://payments.test/checkout/"+input.paymentIntentId,
      expiresAt:null
    };
  }

  async verifyAndParseWebhook(rawBody:string,headers:Record<string,string|undefined>):Promise<VerifiedWebhookEvent>{
    if(headers["x-test-signature"]!=="valid")throw new Error("INVALID_TEST_SIGNATURE");
    const payload=JSON.parse(rawBody) as Omit<VerifiedWebhookEvent,"amountMinor"> & {amountMinor:string};
    return {...payload,amountMinor:BigInt(payload.amountMinor)};
  }

  async refund(input:RefundRequest):Promise<RefundResult>{
    this.refundCalls.push(input);
    return {externalRefundId:"refund-"+input.externalCaptureId,status:"pending"};
  }
}

const db=new DatabaseService();
const quotes=new QuoteService(db);
const holds=new BookingHoldService(db);
const lifecycle=new BookingLifecycleService(db);
const ledger=new LedgerService();
const registry=new PaymentProviderRegistry();
const provider=new TestPaymeProvider();
registry.register(provider);
const recovery=new PaymentRecoveryService(db,ledger);
const intents=new PaymentIntentService(db,registry);
const webhooks=new PaymentWebhookService(db,registry,ledger,recovery);
const refunds=new PaymentRefundWorkerService(db,registry,recovery);

beforeAll(async()=>{
  await db.withActor(actor,async client=>{
    await client.query(
      `INSERT INTO cancellation_policy_templates(id,organization_id,code,name,rules)
       VALUES($1,$2,'PAYMENT_TEST','{"en":"Payment test policy"}'::jsonb,$3::jsonb)
       ON CONFLICT(organization_id,code) DO NOTHING`,
      [POLICY,ORG,JSON.stringify({
        version:1,
        rules:[{minHoursBeforeCheckIn:0,refundBps:10000}],
        nonRefundableLineCodes:[]
      })]
    );
    await client.query("UPDATE rate_plans SET cancellation_policy_id=$1 WHERE id=$2",[POLICY,RATE]);
  });
});

async function quoteAndHold(start:string,end:string,key:string){
  const quote=await quotes.createQuote({
    actor,propertyId:PROPERTY,unitId:UNIT,ratePlanId:RATE,
    checkInAt:start,checkOutAt:end,
    guests:[{age:35,residency:"resident"}]
  });
  const hold=await holds.createHold({actor,quoteId:quote.quoteId,idempotencyKey:key,ttlSeconds:900});
  return {quote,hold};
}

async function paymentFor(reservationId:string,quoteId:string,key:string){
  return intents.create({
    actor,reservationId,quoteId,provider:"payme",idempotencyKey:key,
    returnUrl:"https://views.test/payment-return"
  });
}

function event(input:{
  eventId:string;txId:string;type:VerifiedWebhookEvent["eventType"];paymentIntentId:string;
  amountMinor:bigint;related?:string;
}):VerifiedWebhookEvent{
  return {
    organizationId:ORG,
    externalEventId:input.eventId,
    externalTransactionId:input.txId,
    relatedExternalTransactionId:input.related,
    eventType:input.type,
    paymentIntentId:input.paymentIntentId,
    amountMinor:input.amountMinor,
    currency:"UZS",
    occurredAt:new Date().toISOString(),
    rawMetadata:{source:"test"}
  };
}

describe.sequential("payments and ledger integration",()=>{
  it("creates hosted checkout without receiving card data and replays idempotently",async()=>{
    const {quote,hold}=await quoteAndHold(
      "2028-01-10T14:00:00+05:00","2028-01-12T12:00:00+05:00","pay-hold-1"
    );
    const first=await paymentFor(hold.reservationId,quote.quoteId,"payment-intent-1");
    const second=await paymentFor(hold.reservationId,quote.quoteId,"payment-intent-1");

    expect(first.checkoutUrl).toContain("https://payments.test/checkout/");
    expect(second.paymentIntentId).toBe(first.paymentIntentId);
    expect(second.idempotentReplay).toBe(true);

    const row=await db.withActor(actor,async client=>{
      return (await client.query<{status:string;amount_minor:string;currency:string}>(
        "SELECT status,amount_minor::text,currency FROM payment_intents WHERE id=$1",
        [first.paymentIntentId]
      )).rows[0];
    });
    expect(row.status).toBe("pending_provider");
    expect(BigInt(row.amount_minor)).toBe(quote.totalMinor);
    expect(row.currency).toBe("UZS");
  });

  it("keeps reservation on hold after partial capture and confirms only after full capture",async()=>{
    const {quote,hold}=await quoteAndHold(
      "2028-02-10T14:00:00+05:00","2028-02-12T12:00:00+05:00","pay-hold-2"
    );
    const payment=await paymentFor(hold.reservationId,quote.quoteId,"payment-intent-2");
    const firstAmount=quote.totalMinor/2n;
    const secondAmount=quote.totalMinor-firstAmount;

    const partial=await webhooks.processVerified("payme",event({
      eventId:"evt-capture-part-1",txId:"cap-part-1",type:"captured",
      paymentIntentId:payment.paymentIntentId,amountMinor:firstAmount
    }),"{}");
    expect(partial.status).toBe("partially_captured");

    let state=await db.withActor(actor,async client=>{
      const reservation=(await client.query<{status:string}>(
        "SELECT status FROM reservations WHERE id=$1",[hold.reservationId]
      )).rows[0];
      const intent=(await client.query<{status:string;captured_minor:string}>(
        "SELECT status,captured_minor::text FROM payment_intents WHERE id=$1",[payment.paymentIntentId]
      )).rows[0];
      return {reservation,intent};
    });
    expect(state.reservation.status).toBe("hold");
    expect(state.intent.status).toBe("partially_captured");

    const captured=await webhooks.processVerified("payme",event({
      eventId:"evt-capture-part-2",txId:"cap-part-2",type:"captured",
      paymentIntentId:payment.paymentIntentId,amountMinor:secondAmount
    }),"{}");
    expect(captured.status).toBe("captured");

    state=await db.withActor(actor,async client=>{
      const reservation=(await client.query<{status:string}>(
        "SELECT status FROM reservations WHERE id=$1",[hold.reservationId]
      )).rows[0];
      const intent=(await client.query<{status:string;captured_minor:string}>(
        "SELECT status,captured_minor::text FROM payment_intents WHERE id=$1",[payment.paymentIntentId]
      )).rows[0];
      return {reservation,intent};
    });
    expect(state.reservation.status).toBe("confirmed");
    expect(state.intent.status).toBe("captured");
    expect(BigInt(state.intent.captured_minor)).toBe(quote.totalMinor);
  });

  it("posts balanced guest-deposit journals and ignores duplicate webhook events",async()=>{
    const journalState=await db.withActor(actor,async client=>{
      const journals=await client.query<{id:string}>(
        `SELECT id FROM ledger_journals
         WHERE reference_type='payment_intent' AND description='Guest payment captured'
         ORDER BY created_at DESC LIMIT 2`
      );
      let debit=0n,credit=0n;
      for(const journal of journals.rows){
        const sums=(await client.query<{debit:string;credit:string}>(
          `SELECT
             COALESCE(SUM(CASE WHEN side='debit' THEN amount_minor ELSE 0 END),0)::text AS debit,
             COALESCE(SUM(CASE WHEN side='credit' THEN amount_minor ELSE 0 END),0)::text AS credit
           FROM ledger_entries WHERE journal_id=$1`,
          [journal.id]
        )).rows[0];
        debit+=BigInt(sums.debit);credit+=BigInt(sums.credit);
      }
      return {count:journals.rowCount??0,debit,credit};
    });
    expect(journalState.count).toBeGreaterThanOrEqual(2);
    expect(journalState.debit).toBe(journalState.credit);

    const duplicate=await webhooks.processVerified("payme",event({
      eventId:"evt-capture-part-2",txId:"cap-part-2",type:"captured",
      paymentIntentId:(await db.withActor(actor,async client=>
        (await client.query<{id:string}>("SELECT id FROM payment_intents WHERE idempotency_key='payment-intent-2'")).rows[0].id
      )),
      amountMinor:1n
    }),"{}");
    expect(duplicate.status).toBe("duplicate");

    const paymentIntentId=await db.withActor(actor,async client=>
      (await client.query<{id:string}>("SELECT id FROM payment_intents WHERE idempotency_key='payment-intent-2'")).rows[0].id
    );
    const duplicateTx=await webhooks.processVerified("payme",event({
      eventId:"evt-capture-part-2-replayed",
      txId:"cap-part-2",
      type:"captured",
      paymentIntentId,
      amountMinor:1n
    }),"{}");
    expect(duplicateTx.status).toBe("duplicate_transaction");
  });

  it("rejects a reused webhook event id with a different payload",async()=>{
    const paymentIntentId=await db.withActor(actor,async client=>
      (await client.query<{id:string}>(
        "SELECT id FROM payment_intents WHERE idempotency_key='payment-intent-2'"
      )).rows[0].id
    );
    await expect(webhooks.processVerified("payme",event({
      eventId:"evt-capture-part-2",
      txId:"cap-part-2",
      type:"captured",
      paymentIntentId,
      amountMinor:999n
    }),"{\"changed\":true}")).rejects.toThrow("WEBHOOK_EVENT_PAYLOAD_MISMATCH");
  });

  it("keeps posted ledger immutable",async()=>{
    const journal=await db.withActor(actor,async client=>
      (await client.query<{id:string}>(
        "SELECT id FROM ledger_journals WHERE status='posted' ORDER BY created_at DESC LIMIT 1"
      )).rows[0]
    );
    expect(journal?.id).toBeTruthy();
    await expect(db.withActor(actor,async client=>{
      await client.query(
        "UPDATE ledger_entries SET amount_minor=amount_minor+1 WHERE journal_id=$1",
        [journal.id]
      );
    })).rejects.toThrow(/posted ledger entries are immutable/i);
  });

  it("rejects an unbalanced posted journal at transaction commit",async()=>{
    await expect(db.withActor(actor,async client=>{
      const account=await ledger.ensureAccount(client,ORG,"provider_clearing","UZS");
      const journal=(await client.query<{id:string}>(
        `INSERT INTO ledger_journals(id,organization_id,reference_type,reference_id,idempotency_key,description)
         VALUES(gen_random_uuid(),$1,'test',$2,$3,'Unbalanced test') RETURNING id`,
        [ORG,holdReference(),"unbalanced-journal-"+Date.now()]
      )).rows[0].id;
      await client.query(
        `INSERT INTO ledger_entries(id,journal_id,account_id,side,amount_minor,currency)
         VALUES(gen_random_uuid(),$1,$2,'debit',100,'UZS')`,
        [journal,account]
      );
      await client.query("UPDATE ledger_journals SET status='posted',posted_at=now() WHERE id=$1",[journal]);
    })).rejects.toThrow(/unbalanced journal/i);
  });

  it("turns a late capture into a durable refund and reverses ledger after verified refund",async()=>{
    const {quote,hold}=await quoteAndHold(
      "2028-03-10T14:00:00+05:00","2028-03-12T12:00:00+05:00","pay-hold-late"
    );
    const payment=await paymentFor(hold.reservationId,quote.quoteId,"payment-intent-late");

    await db.withActor(actor,async client=>{
      await client.query(
        "UPDATE reservations SET hold_expires_at=now()-interval '1 second' WHERE id=$1",
        [hold.reservationId]
      );
      await client.query(
        "UPDATE inventory_periods SET expires_at=now()-interval '1 second' WHERE reservation_id=$1",
        [hold.reservationId]
      );
    });

    const late=await webhooks.processRaw("payme",JSON.stringify({
      organizationId:ORG,
      externalEventId:"evt-late-capture",
      externalTransactionId:"cap-late-1",
      eventType:"captured",
      paymentIntentId:payment.paymentIntentId,
      amountMinor:quote.totalMinor.toString(),
      currency:"UZS",
      occurredAt:new Date().toISOString(),
      rawMetadata:{source:"test"}
    }),{"x-test-signature":"valid"});
    expect(late.status).toBe("refund_pending");

    const refundRequest=await db.withActor(actor,async client=>{
      return (await client.query<{status:string;amount_minor:string;external_capture_id:string}>(
        "SELECT status,amount_minor::text,external_capture_id FROM payment_refund_requests WHERE payment_intent_id=$1",
        [payment.paymentIntentId]
      )).rows[0];
    });
    expect(refundRequest.status).toBe("pending");
    expect(BigInt(refundRequest.amount_minor)).toBe(quote.totalMinor);
    expect(refundRequest.external_capture_id).toBe("cap-late-1");
    const lateLedger=await db.withActor(actor,async client=>{
      const row=await client.query<{code:string;side:string}>(
        `SELECT a.code,e.side
           FROM ledger_entries e
           JOIN ledger_accounts a ON a.id=e.account_id
           JOIN ledger_journals j ON j.id=e.journal_id
          WHERE j.reference_id=$1 AND j.description='Late capture pending refund'
          ORDER BY e.side`,
        [payment.paymentIntentId]
      );
      return row.rows;
    });
    expect(lateLedger).toEqual(expect.arrayContaining([
      expect.objectContaining({code:"provider_clearing",side:"debit"}),
      expect.objectContaining({code:"refunds_payable",side:"credit"})
    ]));


    const worker=await refunds.processTenantBatch(ORG,10);
    expect(worker.submitted).toBe(1);
    expect(provider.refundCalls.at(-1)?.externalCaptureId).toBe("cap-late-1");

    const refunded=await webhooks.processVerified("payme",event({
      eventId:"evt-late-refund",
      txId:"refund-cap-late-1",
      related:"cap-late-1",
      type:"refunded",
      paymentIntentId:payment.paymentIntentId,
      amountMinor:quote.totalMinor
    }),"{}");
    expect(refunded.status).toBe("refunded");

    const final=await db.withActor(actor,async client=>{
      const intent=(await client.query<{status:string;captured_minor:string;refunded_minor:string}>(
        "SELECT status,captured_minor::text,refunded_minor::text FROM payment_intents WHERE id=$1",
        [payment.paymentIntentId]
      )).rows[0];
      const request=(await client.query<{status:string}>(
        "SELECT status FROM payment_refund_requests WHERE payment_intent_id=$1",
        [payment.paymentIntentId]
      )).rows[0];
      const reservation=(await client.query<{status:string}>(
        "SELECT status FROM reservations WHERE id=$1",[hold.reservationId]
      )).rows[0];
      return {intent,request,reservation};
    });
    expect(final.intent.status).toBe("refunded");
    expect(BigInt(final.intent.refunded_minor)).toBe(BigInt(final.intent.captured_minor));
    expect(final.request.status).toBe("completed");
    expect(final.reservation.status).toBe("cancelled");
  });
});

function holdReference(){
  return "90000000-0000-4000-8000-"+String(Date.now()).slice(-12).padStart(12,"0");
}

afterAll(async()=>{await db.onModuleDestroy()});
